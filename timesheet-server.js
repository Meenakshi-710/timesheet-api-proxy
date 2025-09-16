// timesheet-server.js - Timesheet API Server for Chrome Extension
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3002;

// CORS configuration for Chrome extension
app.use(
  cors({
    origin: [
      "http://localhost:5173",     // Vite dev
      "http://localhost:3002",     // Local server
      "https://claude.ai",         // Any other web app
      "chrome-extension://didiikhicfjlggddnigelfbopcladhgn",
      "chrome-extension://inaemmingkjlakjfggfifmifihicpcei"
    ],
    credentials: true,
  })
);
app.use(express.json());

// Utility: mask tokens in logs
const mask = (s = "") => {
  if (!s) return "";
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
};

// Extract credentials from request
function extractCredentials(req) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.body?.token;
  const userId = req.params?.id || req.body?.userId || req.headers['x-user-id'];
  const role = req.headers['x-user-role'] || req.body?.role;
  
  return { token, userId, role };
}

// Simple request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Timesheet API server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

// Test endpoint to check target API
app.get("/test-target-api", async (req, res) => {
  try {
    console.log("🧪 Testing target API endpoint...");
    
    if (!TIMESHEET_API_BASE) {
      return res.json({
        error: "TIMESHEET_API_BASE not configured",
        targetUrl: "undefined"
      });
    }

    const testUrl = `${TIMESHEET_API_BASE}/api/v1/attendance/punchIn`;
    console.log("🌐 Testing URL:", testUrl);

    // Test with OPTIONS request first (CORS preflight)
    const optionsResponse = await fetch(testUrl, {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization"
      }
    });

    console.log("📋 OPTIONS response status:", optionsResponse.status);
    console.log("📋 OPTIONS response headers:", Object.fromEntries(optionsResponse.headers.entries()));

    // Test with GET request to see if endpoint exists
    const getResponse = await fetch(testUrl, {
      method: "GET"
    });

    console.log("📋 GET response status:", getResponse.status);
    console.log("📋 GET response headers:", Object.fromEntries(getResponse.headers.entries()));

    const getResponseText = await getResponse.text();
    console.log("📋 GET response body:", getResponseText);

    res.json({
      targetUrl: testUrl,
      optionsStatus: optionsResponse.status,
      getStatus: getResponse.status,
      getResponse: getResponseText.substring(0, 500), // Limit response length
      headers: {
        options: Object.fromEntries(optionsResponse.headers.entries()),
        get: Object.fromEntries(getResponse.headers.entries())
      }
    });

  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({
      error: error.message,
      targetUrl: `${TIMESHEET_API_BASE}/api/v1/attendance/punchIn`
    });
  }
});

// Proxy to your main timesheet API
const TIMESHEET_API_BASE = process.env.TIMESHEET_API_URL || "";

// Validate API base URL
if (!TIMESHEET_API_BASE) {
  console.warn("⚠️  WARNING: TIMESHEET_API_URL environment variable is not set!");
  console.warn("⚠️  Set it with: TIMESHEET_API_URL=https://your-api-url.com node timesheet-server.js");
}

// Create Timesheet Entry
app.post("/api/v1/timesheet/createTimesheet", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);
    
    if (!token) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Provide Bearer token in Authorization header"
      });
    }

    console.log("📝 Creating timesheet entry");
    console.log("🔑 Token:", mask(token));
    console.log("👤 User ID:", userId);
    console.log("📋 Request body:", JSON.stringify(req.body, null, 2));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/timesheet/createTimesheet`;
    
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Create timesheet error:", response.status, errorText);
      return res.status(response.status).json({
        error: errorText,
        status: response.status
      });
    }

    const data = await response.json();
    console.log("✅ Timesheet entry created successfully");
    return res.json(data);

  } catch (err) {
    console.error("❌ Create timesheet exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to create timesheet entry"
    });
  }
});

// Get All Timesheet Types
app.get("/api/v1/timesheet/getTimesheetType", async (req, res) => {
  try {
    const { token, role } = extractCredentials(req);
    
    if (!token) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Provide Bearer token in Authorization header"
      });
    }

    console.log("📋 Fetching timesheet types");
    console.log("🔑 Token:", mask(token));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/timesheet/getTimesheetType`;
    
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json"
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Get timesheet types error:", response.status, errorText);
      return res.status(response.status).json({
        error: errorText,
        status: response.status
      });
    }

    const data = await response.json();
    console.log("✅ Timesheet types fetched successfully");
    return res.json(data);

  } catch (err) {
    console.error("❌ Get timesheet types exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to fetch timesheet types"
    });
  }
});

// Get All Timesheets of Employee
app.get("/api/v1/timesheet/getAllTimesheetOfEmployee/:id", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);
    const employeeId = req.params.id;
    
    if (!token) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Provide Bearer token in Authorization header"
      });
    }

    if (!employeeId) {
      return res.status(400).json({
        error: "Employee ID required",
        message: "Provide employee ID in URL path"
      });
    }

    console.log("📊 Fetching timesheets for employee:", employeeId);
    console.log("🔑 Token:", mask(token));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/timesheet/getAllTimesheetOfEmployee/${employeeId}`;
    
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json"
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Get employee timesheets error:", response.status, errorText);
      return res.status(response.status).json({
        error: errorText,
        status: response.status
      });
    }

    const data = await response.json();
    console.log("✅ Employee timesheets fetched successfully");
    return res.json(data);

  } catch (err) {
    console.error("❌ Get employee timesheets exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to fetch employee timesheets"
    });
  }
});

// Punch In API
app.post("/api/v1/attendance/punchIn", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);
    
    console.log("📍 Punch In request received");
    console.log("🔑 Token:", mask(token));
    console.log("👤 User ID:", userId);
    console.log("👤 Role:", role);
    console.log("📋 Request headers:", req.headers);
    console.log("📋 Request body:", req.body);
    
    if (!token) {
      console.log("❌ No token provided");
      return res.status(401).json({
        error: "Authentication required",
        message: "Provide Bearer token in Authorization header"
      });
    }

    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      console.log("❌ Missing location data");
      return res.status(400).json({
        error: "Location required",
        message: "Both latitude and longitude are required"
      });
    }

    console.log("📍 Location:", { latitude, longitude });

    // Check if API base URL is configured
    if (!TIMESHEET_API_BASE) {
      console.error("❌ TIMESHEET_API_BASE is not configured!");
      return res.status(500).json({
        error: "Server configuration error",
        message: "TIMESHEET_API_URL environment variable is not set",
        details: {
          hasApiBase: false,
          targetUrl: "undefined/api/v1/attendance/punchIn"
        }
      });
    }

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/attendance/punchIn`;
    
    console.log("🌐 Target URL:", targetUrl);
    console.log("🔧 TIMESHEET_API_BASE:", TIMESHEET_API_BASE);
    
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Timesheet-Proxy-Server/1.0.0"
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    // Add user ID to headers if available (extract from token or request)
    const extractedUserId = req.body?.userId || req.headers['x-user-id'] || userId;
    if (extractedUserId) {
      headers["x-user-id"] = extractedUserId;
    }

    console.log("📤 Forwarding request to target API with headers:", headers);
    console.log("📤 Request body:", { latitude, longitude });

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ latitude, longitude })
    });

    console.log("📥 Target API response status:", response.status);
    console.log("📥 Target API response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Punch in error:", response.status, errorText);
      console.error("❌ Full error details:", {
        status: response.status,
        statusText: response.statusText,
        url: targetUrl,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText
      });
      
      // Return more detailed error information
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
        details: {
          targetUrl: targetUrl,
          apiBase: TIMESHEET_API_BASE,
          hasApiBase: !!TIMESHEET_API_BASE,
          tokenProvided: !!token,
          tokenLength: token ? token.length : 0
        }
      });
    }

    const data = await response.json();
    console.log("✅ Punch in successful");
    return res.json(data);

  } catch (err) {
    console.error("❌ Punch in exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to punch in"
    });
  }
});

// Generic proxy for other timesheet endpoints
app.all(/^\/api\/v1\/timesheet\/(.*)$/, async (req, res) => {
  try {
    const { token, role } = extractCredentials(req);
    
    if (!token) {
      return res.status(401).json({
        error: "Authentication required",
        message: "Provide Bearer token in Authorization header"
      });
    }

    // Build target URL
    const pathAfter = req.params[0] ? `/${req.params[0]}` : "";
    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/timesheet${pathAfter}`;

    console.log(`🌐 Proxying to: ${targetUrl}`);
    console.log("🔑 Token:", mask(token));

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": req.headers.accept || "application/json",
      "Content-Type": req.headers["content-type"] || "application/json"
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    const body = ["GET", "HEAD"].includes(req.method)
      ? undefined
      : JSON.stringify(req.body || {});

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (err) {
    console.error("❌ Generic proxy error:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to proxy request to timesheet API"
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error("🚨 Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: String(err)
  });
});

app.listen(PORT, () => {
  console.log(`✅ Timesheet API server running on http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Proxying to: ${TIMESHEET_API_BASE}`);
});