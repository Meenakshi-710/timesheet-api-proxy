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
      "http://localhost:5173", // Vite dev
      "http://localhost:3002", // Local server
      "https://claude.ai", // Any other web app
      "chrome-extension://didiikhicfjlggddnigelfbopcladhgn",
      "chrome-extension://inaemmingkjlakjfggfifmifihicpcei",
    ],
    credentials: true,
  })
);
// Body parsing middleware with error handling
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Debug middleware for body parsing
app.use((req, res, next) => {
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    console.log("📋 Body parsing debug:");
    console.log("📋 Content-Type:", req.headers["content-type"]);
    console.log("📋 Body keys:", req.body ? Object.keys(req.body) : "No body");
    console.log("📋 Body:", req.body);
  }
  next();
});

// Utility: mask tokens in logs
const mask = (s = "") => {
  if (!s) return "";
  if (s.length <= 8) return "****";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
};

// Extract credentials from request
function extractCredentials(req) {
  // Try Bearer token first
  let token =
    req.headers.authorization?.replace("Bearer ", "") || req.body?.token;

  // If no Bearer token, try to extract from cookies
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(";").reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      acc[key] = value;
      return acc;
    }, {});

    // Try to find user data in cookies
    const userCookie = cookies.currentUser || cookies.user || cookies.authUser;
    if (userCookie) {
      try {
        const userData = JSON.parse(decodeURIComponent(userCookie));
        token =
          userData.accessToken ||
          userData.data?.accessToken ||
          userData.token ||
          userData.data?.token;
        console.log(
          "🍪 Extracted token from cookie:",
          token ? mask(token) : "No token found"
        );
      } catch (error) {
        console.error("❌ Error parsing user cookie:", error);
      }
    }
  }

  const userId = req.params?.id || req.body?.userId || req.headers["x-user-id"];
  const role = req.headers["x-user-role"] || req.body?.role;

  return { token, userId, role };
}

// Simple request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log("📋 Request headers:", req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("📋 Request body:", req.body);
  }
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Timesheet API server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Authentication test endpoint
app.get("/api/v1/auth/test", (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);

    res.json({
      status: "ok",
      message: "Authentication test endpoint",
      timestamp: new Date().toISOString(),
      auth: {
        hasToken: !!token,
        tokenMasked: token ? mask(token) : null,
        userId: userId || null,
        role: role || null,
        hasCookies: !!req.headers.cookie,
        cookies: req.headers.cookie
          ? req.headers.cookie.split(";").map((c) => c.trim().split("=")[0])
          : [],
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Authentication test failed",
      message: String(error),
    });
  }
});

// Simple test endpoint for POST requests
app.post("/api/v1/test", (req, res) => {
  try {
    res.json({
      status: "ok",
      message: "Test POST endpoint working",
      timestamp: new Date().toISOString(),
      received: {
        body: req.body,
        headers: req.headers,
        method: req.method,
        url: req.url,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Test endpoint failed",
      message: String(error),
    });
  }
});

// Office configuration endpoint
app.get("/api/v1/office-config", (req, res) => {
  try {
    const config = {
      data: {
        mainOffice: {
          latitude: process.env.DEFAULT_LATITUDE
            ? parseFloat(process.env.DEFAULT_LATITUDE)
            : null,
          longitude: process.env.DEFAULT_LONGITUDE
            ? parseFloat(process.env.DEFAULT_LONGITUDE)
            : null,
          radius: LOCATION_CONFIG.DEFAULT_RADIUS,
          name: "Default Office",
          configured: !!(
            process.env.DEFAULT_LATITUDE && process.env.DEFAULT_LONGITUDE
          ),
        },
        mumbaiOffice: {
          latitude: process.env.MUMBAI_LATITUDE
            ? parseFloat(process.env.MUMBAI_LATITUDE)
            : null,
          longitude: process.env.MUMBAI_LONGITUDE
            ? parseFloat(process.env.MUMBAI_LONGITUDE)
            : null,
          radius: process.env.MUMBAI_RADIUS
            ? parseFloat(process.env.MUMBAI_RADIUS)
            : LOCATION_CONFIG.DEFAULT_RADIUS,
          name: "Mumbai Office",
          configured: !!(
            process.env.MUMBAI_LATITUDE && process.env.MUMBAI_LONGITUDE
          ),
        },
        additionalOffice: {
          latitude: process.env.ADDITIONAL_LATITUDE
            ? parseFloat(process.env.ADDITIONAL_LATITUDE)
            : null,
          longitude: process.env.ADDITIONAL_LONGITUDE
            ? parseFloat(process.env.ADDITIONAL_LONGITUDE)
            : null,
          radius: process.env.ADDITIONAL_RADIUS
            ? parseFloat(process.env.ADDITIONAL_RADIUS)
            : LOCATION_CONFIG.DEFAULT_RADIUS,
          name: "Additional Office",
          configured: !!(
            process.env.ADDITIONAL_LATITUDE && process.env.ADDITIONAL_LONGITUDE
          ),
        },
        settings: {
          allowDynamicLocation: LOCATION_CONFIG.ALLOW_DYNAMIC_LOCATION,
          maxDistanceFromOffice: LOCATION_CONFIG.MAX_DISTANCE_FROM_OFFICE,
          defaultRadius: LOCATION_CONFIG.DEFAULT_RADIUS,
        },
      },
    };

    res.json(config);
  } catch (error) {
    console.error("❌ Office config error:", error);
    res.status(500).json({
      error: "Failed to get office configuration",
      message: String(error),
    });
  }
});

// Test location validation
app.get("/test-location-validation", (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        error: "Missing coordinates",
        message: "Provide lat and lng query parameters",
        example: "/test-location-validation?lat=26.257544&lng=73.009617",
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        error: "Invalid coordinates",
        message: "Latitude and longitude must be valid numbers",
      });
    }

    const validation = validateLocation(latitude, longitude);

    res.json({
      userLocation: { latitude, longitude },
      validation,
      locationConfig: LOCATION_CONFIG,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Location validation test error:", error);
    res.status(500).json({
      error: error.message,
    });
  }
});

// Test endpoint to check target API
app.get("/test-target-api", async (req, res) => {
  try {
    console.log("🧪 Testing target API endpoints...");

    if (!TIMESHEET_API_BASE) {
      return res.json({
        error: "TIMESHEET_API_BASE not configured",
        targetUrl: "undefined",
      });
    }

    const baseUrl = TIMESHEET_API_BASE;
    const testEndpoints = [
      "/api/v1/attendance/checkin",
      "/api/v1/attendance/check-in",
      "/api/v1/attendance",
      "/api/v1/attendance/",
    ];

    const results = {};

    for (const endpoint of testEndpoints) {
      const testUrl = `${baseUrl}${endpoint}`;
      console.log(`🌐 Testing: ${testUrl}`);

      try {
        // Test with GET request
        const getResponse = await fetch(testUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Timesheet-Proxy-Test/1.0.0",
          },
        });

        const responseText = await getResponse.text();

        results[endpoint] = {
          status: getResponse.status,
          statusText: getResponse.statusText,
          response: responseText.substring(0, 200),
          headers: Object.fromEntries(getResponse.headers.entries()),
        };

        console.log(
          `📋 ${endpoint}: ${getResponse.status} ${getResponse.statusText}`
        );
      } catch (error) {
        results[endpoint] = {
          error: error.message,
          status: "ERROR",
        };
        console.log(`❌ ${endpoint}: ${error.message}`);
      }
    }

    res.json({
      baseUrl: baseUrl,
      testResults: results,
      summary: {
        total: testEndpoints.length,
        successful: Object.values(results).filter(
          (r) => r.status && r.status < 400
        ).length,
        errors: Object.values(results).filter((r) => r.error).length,
      },
    });
  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({
      error: error.message,
      baseUrl: TIMESHEET_API_BASE,
    });
  }
});

// Proxy to your main timesheet API
const TIMESHEET_API_BASE = process.env.TIMESHEET_API_URL || "";

// Location validation configuration
const LOCATION_CONFIG = {
  // Default radius for location validation (in meters)
  DEFAULT_RADIUS: parseFloat(process.env.DEFAULT_RADIUS) || 100,

  // Allow dynamic location detection
  ALLOW_DYNAMIC_LOCATION: process.env.ALLOW_DYNAMIC_LOCATION === "true" || true, // Default to true
  MAX_DISTANCE_FROM_OFFICE:
    parseFloat(process.env.MAX_DISTANCE_FROM_OFFICE) || 5000, // 5km max distance
};

// Validate API base URL
if (!TIMESHEET_API_BASE) {
  console.warn(
    "⚠️  WARNING: TIMESHEET_API_URL environment variable is not set!"
  );
  console.warn(
    "⚠️  Set it with: TIMESHEET_API_URL=https://your-api-url.com node timesheet-server.js"
  );
}

// Utility function to calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in meters
  return distance;
}

// Function to validate if the provided coordinates are within allowed locations
function validateLocation(userLatitude, userLongitude) {
  // If dynamic location is enabled, always allow the location
  if (LOCATION_CONFIG.ALLOW_DYNAMIC_LOCATION) {
    return {
      isValid: true,
      matchedLocation: "Dynamic Location",
      distance: 0,
      allowedRadius: LOCATION_CONFIG.DEFAULT_RADIUS,
      message: "Location validated using dynamic detection",
    };
  }

  // If dynamic location is disabled, check against configured office locations
  const locations = [];

  // Check for environment variables for office locations
  if (process.env.DEFAULT_LATITUDE && process.env.DEFAULT_LONGITUDE) {
    locations.push({
      name: "Default Office",
      latitude: parseFloat(process.env.DEFAULT_LATITUDE),
      longitude: parseFloat(process.env.DEFAULT_LONGITUDE),
      radius: LOCATION_CONFIG.DEFAULT_RADIUS,
    });
  }

  if (process.env.MUMBAI_LATITUDE && process.env.MUMBAI_LONGITUDE) {
    locations.push({
      name: "Mumbai Office",
      latitude: parseFloat(process.env.MUMBAI_LATITUDE),
      longitude: parseFloat(process.env.MUMBAI_LONGITUDE),
      radius:
        parseFloat(process.env.MUMBAI_RADIUS) || LOCATION_CONFIG.DEFAULT_RADIUS,
    });
  }

  if (process.env.ADDITIONAL_LATITUDE && process.env.ADDITIONAL_LONGITUDE) {
    locations.push({
      name: "Additional Office",
      latitude: parseFloat(process.env.ADDITIONAL_LATITUDE),
      longitude: parseFloat(process.env.ADDITIONAL_LONGITUDE),
      radius:
        parseFloat(process.env.ADDITIONAL_RADIUS) ||
        LOCATION_CONFIG.DEFAULT_RADIUS,
    });
  }

  // If no locations are configured, allow the location
  if (locations.length === 0) {
    return {
      isValid: true,
      matchedLocation: "No Office Locations Configured",
      distance: 0,
      allowedRadius: LOCATION_CONFIG.DEFAULT_RADIUS,
      message: "No office locations configured, allowing location",
    };
  }

  // Check against configured locations
  for (const location of locations) {
    const distance = calculateDistance(
      userLatitude,
      userLongitude,
      location.latitude,
      location.longitude
    );

    if (distance <= location.radius) {
      return {
        isValid: true,
        matchedLocation: location.name,
        distance: Math.round(distance),
        allowedRadius: location.radius,
      };
    }
  }

  // Find the closest location for error reporting
  let closestLocation = null;
  let minDistance = Infinity;

  for (const location of locations) {
    const distance = calculateDistance(
      userLatitude,
      userLongitude,
      location.latitude,
      location.longitude
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestLocation = location;
    }
  }

  return {
    isValid: false,
    closestLocation: closestLocation?.name || "Unknown",
    distance: Math.round(minDistance),
    allowedRadius: closestLocation?.radius || LOCATION_CONFIG.DEFAULT_RADIUS,
    message: `You are ${Math.round(
      minDistance
    )}m away from the nearest allowed location (${
      closestLocation?.name
    }). Maximum allowed distance is ${closestLocation?.radius}m.`,
  };
}

// Create Timesheet Entry
app.post("/api/v1/timesheet/createTimesheet", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);

    // Check if we have either a token or cookies for authentication
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    console.log("📝 Creating timesheet entry");
    console.log("🔑 Token:", mask(token));
    console.log("👤 User ID:", userId);
    console.log("📋 Request body:", JSON.stringify(req.body, null, 2));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/timesheet/createTimesheet`;

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Create timesheet error:", response.status, errorText);
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
      });
    }

    const data = await response.json();
    console.log("✅ Timesheet entry created successfully");
    return res.json(data);
  } catch (err) {
    console.error("❌ Create timesheet exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to create timesheet entry",
    });
  }
});

// Get All Timesheet Types
app.get("/api/v1/timesheet/getTimesheetType", async (req, res) => {
  try {
    const { token, role } = extractCredentials(req);

    // Check if we have either a token or cookies for authentication
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    console.log("📋 Fetching timesheet types");
    console.log("🔑 Token:", mask(token));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/timesheet/getTimesheetType`;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "❌ Get timesheet types error:",
        response.status,
        errorText
      );
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
      });
    }

    const data = await response.json();
    console.log("✅ Timesheet types fetched successfully");
    return res.json(data);
  } catch (err) {
    console.error("❌ Get timesheet types exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to fetch timesheet types",
    });
  }
});

// Create Timesheet Type
app.post("/api/v1/timesheet/createTimesheetType", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);

    // Check if we have either a token or cookies for authentication
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Name required",
        message: "Provide name in request body",
      });
    }

    console.log("📝 Creating timesheet type");
    console.log("🔑 Token:", mask(token));
    console.log("👤 User ID:", userId);
    console.log("📋 Request body:", JSON.stringify(req.body, null, 2));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/timesheet/createTimesheetType`;

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    // Forward cookies if available
    if (req.headers.cookie) {
      headers["Cookie"] = req.headers.cookie;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: name.trim() }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "❌ Create timesheet type error:",
        response.status,
        errorText
      );
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
      });
    }

    const data = await response.json();
    console.log("✅ Timesheet type created successfully");
    return res.json(data);
  } catch (err) {
    console.error("❌ Create timesheet type exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to create timesheet type",
    });
  }
});

// Get All Timesheets of Employee
app.get("/api/v1/timesheet/getAllTimesheetOfEmployee/:id", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);
    const employeeId = req.params.id;

    // Check if we have either a token or cookies for authentication
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    if (!employeeId) {
      return res.status(400).json({
        error: "Employee ID required",
        message: "Provide employee ID in URL path",
      });
    }

    console.log("📊 Fetching timesheets for employee:", employeeId);
    console.log("🔑 Token:", mask(token));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/timesheet/getAllTimesheetOfEmployee/${employeeId}`;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "❌ Get employee timesheets error:",
        response.status,
        errorText
      );
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
      });
    }

    const data = await response.json();
    console.log("✅ Employee timesheets fetched successfully");
    return res.json(data);
  } catch (err) {
    console.error("❌ Get employee timesheets exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to fetch employee timesheets",
    });
  }
});

// Punch In endpoint
app.post("/api/v1/attendance/punchIn", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);

    // Check if we have either a token or cookies for authentication
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: "Location required",
        message: "Provide latitude and longitude in request body",
      });
    }

    // Validate location
    const locationValidation = validateLocation(latitude, longitude);
    if (!locationValidation.isValid) {
      return res.status(400).json({
        error: "Location not allowed",
        message: locationValidation.message,
        validation: locationValidation,
      });
    }

    console.log("⏰ Processing punch in");
    console.log("🔑 Token:", mask(token));
    console.log("📍 Location:", { latitude, longitude });
    console.log("✅ Location validated:", locationValidation.matchedLocation);

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/attendance/punchIn`;

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    // Forward cookies if available
    if (req.headers.cookie) {
      headers["Cookie"] = req.headers.cookie;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ latitude, longitude }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Punch in error:", response.status, errorText);
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
      });
    }

    const data = await response.json();
    console.log("✅ Punch in successful");
    return res.json(data);
  } catch (err) {
    console.error("❌ Punch in exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to punch in",
    });
  }
});

// Punch Out endpoint
app.post("/api/v1/attendance/punchOut", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);

    // Check if we have either a token or cookies for authentication
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: "Location required",
        message: "Provide latitude and longitude in request body",
      });
    }

    // Validate location
    const locationValidation = validateLocation(latitude, longitude);
    if (!locationValidation.isValid) {
      return res.status(400).json({
        error: "Location not allowed",
        message: locationValidation.message,
        validation: locationValidation,
      });
    }

    console.log("⏰ Processing punch out");
    console.log("🔑 Token:", mask(token));
    console.log("📍 Location:", { latitude, longitude });
    console.log("✅ Location validated:", locationValidation.matchedLocation);

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/attendance/punchOut`;

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    // Forward cookies if available
    if (req.headers.cookie) {
      headers["Cookie"] = req.headers.cookie;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ latitude, longitude }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Punch out error:", response.status, errorText);
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
      });
    }

    const data = await response.json();
    console.log("✅ Punch out successful");
    return res.json(data);
  } catch (err) {
    console.error("❌ Punch out exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to punch out",
    });
  }
});

// Get today's attendance status
app.get("/api/v1/attendance/todayAttendance", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);

    // Check if we have either a token or cookies for authentication
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    console.log("📊 Fetching today's attendance");
    console.log("🔑 Token:", mask(token));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/attendance/todayAttendance`;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    // Forward cookies if available
    if (req.headers.cookie) {
      headers["Cookie"] = req.headers.cookie;
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "❌ Get today's attendance error:",
        response.status,
        errorText
      );
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
      });
    }

    const data = await response.json();
    console.log("✅ Today's attendance fetched successfully");
    return res.json(data);
  } catch (err) {
    console.error("❌ Get today's attendance exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to fetch today's attendance",
    });
  }
});

// Get All Employees
app.get("/api/v1/admin/getAllEmployees", async (req, res) => {
  try {
    const { token, role } = extractCredentials(req);

    // Check if we have either a token or cookies for authentication
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    console.log("👥 Fetching all employees");
    console.log("🔑 Token:", mask(token));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/admin/getAllEmployees`;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    // Forward cookies if available
    if (req.headers.cookie) {
      headers["Cookie"] = req.headers.cookie;
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Get all employees error:", response.status, errorText);
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
      });
    }

    const data = await response.json();
    console.log("✅ All employees fetched successfully");
    return res.json(data);
  } catch (err) {
    console.error("❌ Get all employees exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to fetch all employees",
    });
  }
});

// Create Notification (proxy) - send notification to a recipient (employee)
app.post("/api/v1/notification/send", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);
    const { recipient, title, body } = req.body || {};

    // Basic auth/cookie check like other endpoints
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    if (!recipient) {
      return res.status(400).json({
        error: "Recipient required",
        message: "Provide recipient (employee id) in request body",
      });
    }

    if (!TIMESHEET_API_BASE) {
      return res.status(500).json({
        error: "TIMESHEET_API_BASE not configured",
        message: "Server is not configured with target timesheet API base URL",
      });
    }

    console.log("🔔 Sending notification to recipient:", recipient);
    console.log("🔑 Token:", mask(token));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/notification/send`;

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (role) {
      headers["x-user-role"] = role;
    }

    // Forward cookies if present (cookie-based auth)
    if (req.headers.cookie) {
      headers["Cookie"] = req.headers.cookie;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        recipient,
        title: title || null,
        body: body || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Notification proxy error:", response.status, errorText);
      return res.status(response.status).json({
        error: errorText,
        status: response.status,
      });
    }

    const data = await response.json().catch(() => ({}));
    console.log("✅ Notification proxied successfully");
    return res.json(data);
  } catch (err) {
    console.error("❌ Notification send exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to send notification",
    });
  }
});

// New: Get notifications for a recipient (proxy) - matches provided API /getNotifications/:id
app.get("/api/v1/notification/getNotifications/:id", async (req, res) => {
  try {
    const { token, role } = extractCredentials(req);
    const recipientId = req.params.id;

    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    if (!recipientId) {
      return res.status(400).json({
        error: "Recipient id required",
        message: "Provide recipient id in URL path",
      });
    }

    if (!TIMESHEET_API_BASE) {
      return res.status(500).json({
        error: "TIMESHEET_API_BASE not configured",
        message: "Server is not configured with target timesheet API base URL",
      });
    }

    console.log("🔍 Fetching notifications for recipient:", recipientId);
    console.log("🔑 Token:", mask(token));

    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/notification/getNotifications/${recipientId}`;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (role) {
      headers["x-user-role"] = role;
    }

    // Forward cookies if present (cookie-based auth)
    if (req.headers.cookie) {
      headers["Cookie"] = req.headers.cookie;
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers,
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      const text = await response.text();
      console.error(
        "❌ Notification fetch proxy error:",
        response.status,
        text
      );
      return res.status(response.status).json({
        error: text,
        status: response.status,
      });
    }

    if (contentType.includes("application/json")) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (err) {
    console.error("❌ Notification fetch exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to fetch notifications for recipient",
    });
  }
});

// Generic proxy for other timesheet endpoints
app.all(/^\/api\/v1\/timesheet\/(.*)$/, async (req, res) => {
  try {
    const { token, role } = extractCredentials(req);

    // Check if we have either a token or cookies for authentication
    if (!token && !req.headers.cookie) {
      return res.status(401).json({
        error: "Authentication required",
        message:
          "Provide Bearer token in Authorization header or authentication cookies",
      });
    }

    // Build target URL
    const pathAfter = req.params[0] ? `/${req.params[0]}` : "";
    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/timesheet${pathAfter}`;

    console.log(`🌐 Proxying to: ${targetUrl}`);
    console.log("🔑 Token:", mask(token));

    const headers = {
      Accept: req.headers.accept || "application/json",
      "Content-Type": req.headers["content-type"] || "application/json",
    };

    // Forward cookies directly to target API (cookie-based authentication)
    if (req.headers.cookie) {
      headers["Cookie"] = req.headers.cookie;
      console.log("🍪 Forwarding cookies to target API");
    }

    // Also try Bearer token as fallback if available
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      console.log("🔑 Also forwarding Bearer token as fallback");
    }

    if (role) {
      headers["x-user-role"] = role;
    }

    const body = ["GET", "HEAD"].includes(req.method)
      ? undefined
      : JSON.stringify(req.body || {});

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
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
      message: "Failed to proxy request to timesheet API",
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error("🚨 Unhandled error:", err);
  console.error("🚨 Error stack:", err.stack);
  console.error("🚨 Request details:", {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
  });
  res.status(500).json({
    error: "Internal server error",
    message: String(err),
  });
});

// Catch-all handler for unmatched routes
app.use((req, res) => {
  console.error("🚨 Route not found:", req.method, req.url);
  res.status(404).json({
    error: "Route not found",
    message: `${req.method} ${req.url} not found`,
  });
});

app.listen(PORT, () => {
  console.log(`✅ Timesheet API server running on http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Proxying to: ${TIMESHEET_API_BASE}`);
});
