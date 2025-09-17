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
// Body parsing middleware with error handling
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Debug middleware for body parsing
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    console.log("📋 Body parsing debug:");
    console.log("📋 Content-Type:", req.headers['content-type']);
    console.log("📋 Body keys:", req.body ? Object.keys(req.body) : 'No body');
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
  let token = req.headers.authorization?.replace('Bearer ', '') || req.body?.token;
  
  // If no Bearer token, try to extract from cookies
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    
    // Try to find user data in cookies
    const userCookie = cookies.currentUser || cookies.user || cookies.authUser;
    if (userCookie) {
      try {
        const userData = JSON.parse(decodeURIComponent(userCookie));
        token = userData.accessToken || userData.data?.accessToken || userData.token || userData.data?.token;
        console.log("🍪 Extracted token from cookie:", token ? mask(token) : "No token found");
      } catch (error) {
        console.error("❌ Error parsing user cookie:", error);
      }
    }
  }
  
  const userId = req.params?.id || req.body?.userId || req.headers['x-user-id'];
  const role = req.headers['x-user-role'] || req.body?.role;
  
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
    version: "1.0.0"
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
        cookies: req.headers.cookie ? req.headers.cookie.split(';').map(c => c.trim().split('=')[0]) : []
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Authentication test failed",
      message: String(error)
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
        url: req.url
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Test endpoint failed",
      message: String(error)
    });
  }
});

// Office configuration endpoint
app.get("/api/v1/office-config", (req, res) => {
  try {
    const config = {
      data: {
        mainOffice: {
          latitude: LOCATION_CONFIG.DEFAULT_LATITUDE,
          longitude: LOCATION_CONFIG.DEFAULT_LONGITUDE,
          radius: LOCATION_CONFIG.DEFAULT_RADIUS,
          name: "Default Office",
          configured: true
        },
        mumbaiOffice: {
          latitude: LOCATION_CONFIG.MUMBAI_LATITUDE,
          longitude: LOCATION_CONFIG.MUMBAI_LONGITUDE,
          radius: LOCATION_CONFIG.MUMBAI_RADIUS,
          name: "Mumbai Office",
          configured: true
        },
        currentLocation: {
          latitude: LOCATION_CONFIG.CURRENT_LATITUDE,
          longitude: LOCATION_CONFIG.CURRENT_LONGITUDE,
          radius: LOCATION_CONFIG.CURRENT_RADIUS,
          name: "Current Location",
          configured: true
        }
      }
    };
    
    res.json(config);
  } catch (error) {
    console.error("❌ Office config error:", error);
    res.status(500).json({
      error: "Failed to get office configuration",
      message: String(error)
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
        example: "/test-location-validation?lat=26.257544&lng=73.009617"
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        error: "Invalid coordinates",
        message: "Latitude and longitude must be valid numbers"
      });
    }

    const validation = validateLocation(latitude, longitude);
    
    res.json({
      userLocation: { latitude, longitude },
      validation,
      locationConfig: LOCATION_CONFIG,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Location validation test error:", error);
    res.status(500).json({
      error: error.message
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
        targetUrl: "undefined"
      });
    }

    const baseUrl = TIMESHEET_API_BASE;
    const testEndpoints = [
      "/api/v1/attendance/punchIn",
      "/api/v1/attendance/punch-in", 
      "/api/v1/attendance/checkin",
      "/api/v1/attendance/check-in",
      "/api/v1/attendance",
      "/api/v1/attendance/",
      "/api/attendance/punchIn",
      "/attendance/punchIn"
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
            "User-Agent": "Timesheet-Proxy-Test/1.0.0"
          }
        });

        const responseText = await getResponse.text();
        
        results[endpoint] = {
          status: getResponse.status,
          statusText: getResponse.statusText,
          response: responseText.substring(0, 200),
          headers: Object.fromEntries(getResponse.headers.entries())
        };

        console.log(`📋 ${endpoint}: ${getResponse.status} ${getResponse.statusText}`);

      } catch (error) {
        results[endpoint] = {
          error: error.message,
          status: "ERROR"
        };
        console.log(`❌ ${endpoint}: ${error.message}`);
      }
    }

    res.json({
      baseUrl: baseUrl,
      testResults: results,
      summary: {
        total: testEndpoints.length,
        successful: Object.values(results).filter(r => r.status && r.status < 400).length,
        errors: Object.values(results).filter(r => r.error).length
      }
    });

  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({
      error: error.message,
      baseUrl: TIMESHEET_API_BASE
    });
  }
});

// Test different request formats for punchOut
app.get("/test-punchout-formats", async (req, res) => {
  try {
    console.log("🧪 Testing different punchOut request formats...");
    
    if (!TIMESHEET_API_BASE) {
      return res.json({
        error: "TIMESHEET_API_BASE not configured"
      });
    }

    const baseUrl = TIMESHEET_API_BASE;
    const testUrl = `${baseUrl}/api/v1/attendance/punchOut`;
    
    // Test different request formats
    const testFormats = [
      {
        name: "Empty body (no location)",
        body: {}
      },
      {
        name: "With location data",
        body: { latitude: 24.9167872, longitude: 74.62912 }
      },
      {
        name: "With userId",
        body: { 
          latitude: 24.9167872, 
          longitude: 74.62912,
          userId: "686b969fa9a09ec6aa52372b"
        }
      },
      {
        name: "With timestamp",
        body: { 
          latitude: 24.9167872, 
          longitude: 74.62912,
          timestamp: new Date().toISOString()
        }
      },
      {
        name: "With all fields",
        body: { 
          latitude: 24.9167872, 
          longitude: 74.62912,
          userId: "686b969fa9a09ec6aa52372b",
          timestamp: new Date().toISOString(),
          type: "punch_out"
        }
      }
    ];

    const results = {};

    for (const format of testFormats) {
      console.log(`🌐 Testing format: ${format.name}`);
      
      try {
        const response = await fetch(testUrl, {
          method: "POST",
          headers: {
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODZiOTY5ZmE5YTA5ZWM2YWE1MjM3MmIiLCJlbWFpbCI6Im1lZW5ha3NoaUB0ZXF1aXR5LnRlY2giLCJyb2xlIjoiRW1wbG95ZWUiLCJuYW1lIjoiTWVlbmFrc2hpIEd1cmphciIsImlhdCI6MTc1ODAyNDgwNCwiZXhwIjoxNzU4NDU2ODA0fQ.WUaRQUqdeUW2RkTgDjsLrOk765dO1oZs_gg8U4s5XmE",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Timesheet-Proxy-Test/1.0.0",
            "x-user-role": "Employee"
          },
          body: JSON.stringify(format.body)
        });

        const responseText = await response.text();
        
        results[format.name] = {
          status: response.status,
          statusText: response.statusText,
          response: responseText.substring(0, 300),
          requestBody: format.body
        };

        console.log(`📋 ${format.name}: ${response.status} ${response.statusText}`);

      } catch (error) {
        results[format.name] = {
          error: error.message,
          status: "ERROR",
          requestBody: format.body
        };
        console.log(`❌ ${format.name}: ${error.message}`);
      }
    }

    res.json({
      testUrl: testUrl,
      results: results,
      summary: {
        total: testFormats.length,
        successful: Object.values(results).filter(r => r.status && r.status < 400).length,
        errors: Object.values(results).filter(r => r.error).length
      }
    });

  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Test different request formats for punchIn
app.get("/test-punchin-formats", async (req, res) => {
  try {
    console.log("🧪 Testing different punchIn request formats...");
    
    if (!TIMESHEET_API_BASE) {
      return res.json({
        error: "TIMESHEET_API_BASE not configured"
      });
    }

    const baseUrl = TIMESHEET_API_BASE;
    const testUrl = `${baseUrl}/api/v1/attendance/punchIn`;
    
    // Test different request formats
    const testFormats = [
      {
        name: "Current format (lat/lng only)",
        body: { latitude: 24.9167872, longitude: 74.62912 }
      },
      {
        name: "With userId",
        body: { 
          latitude: 24.9167872, 
          longitude: 74.62912,
          userId: "686b969fa9a09ec6aa52372b"
        }
      },
      {
        name: "With timestamp",
        body: { 
          latitude: 24.9167872, 
          longitude: 74.62912,
          timestamp: new Date().toISOString()
        }
      },
      {
        name: "With all fields",
        body: { 
          latitude: 24.9167872, 
          longitude: 74.62912,
          userId: "686b969fa9a09ec6aa52372b",
          timestamp: new Date().toISOString(),
          type: "punch_in"
        }
      },
      {
        name: "Different field names",
        body: { 
          lat: 24.9167872, 
          lng: 74.62912
        }
      }
    ];

    const results = {};

    for (const format of testFormats) {
      console.log(`🌐 Testing format: ${format.name}`);
      
      try {
        const response = await fetch(testUrl, {
          method: "POST",
          headers: {
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODZiOTY5ZmE5YTA5ZWM2YWE1MjM3MmIiLCJlbWFpbCI6Im1lZW5ha3NoaUB0ZXF1aXR5LnRlY2giLCJyb2xlIjoiRW1wbG95ZWUiLCJuYW1lIjoiTWVlbmFrc2hpIEd1cmphciIsImlhdCI6MTc1ODAyNDgwNCwiZXhwIjoxNzU4NDU2ODA0fQ.WUaRQUqdeUW2RkTgDjsLrOk765dO1oZs_gg8U4s5XmE",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Timesheet-Proxy-Test/1.0.0",
            "x-user-role": "Employee"
          },
          body: JSON.stringify(format.body)
        });

        const responseText = await response.text();
        
        results[format.name] = {
          status: response.status,
          statusText: response.statusText,
          response: responseText.substring(0, 300),
          requestBody: format.body
        };

        console.log(`📋 ${format.name}: ${response.status} ${response.statusText}`);

      } catch (error) {
        results[format.name] = {
          error: error.message,
          status: "ERROR",
          requestBody: format.body
        };
        console.log(`❌ ${format.name}: ${error.message}`);
      }
    }

    res.json({
      testUrl: testUrl,
      results: results,
      summary: {
        total: testFormats.length,
        successful: Object.values(results).filter(r => r.status && r.status < 400).length,
        errors: Object.values(results).filter(r => r.error).length
      }
    });

  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Test the actual timesheet creation format that's being sent
app.get("/test-actual-timesheet-format", async (req, res) => {
  try {
    console.log("🧪 Testing actual timesheet creation format...");
    
    if (!TIMESHEET_API_BASE) {
      return res.json({
        error: "TIMESHEET_API_BASE not configured"
      });
    }

    const baseUrl = TIMESHEET_API_BASE;
    const testUrl = `${baseUrl}/api/v1/timesheet/createTimesheet`;
    
    // This is the exact format being sent by the punch in endpoint
    const timesheetData = {
      projectName: "Attendance",
      task: "Punch In",
      subtasks: [
        {
          name: `Punched in at ${new Date().toLocaleTimeString()}`,
          status: "completed"
        }
      ],
      hours: 0,
      date: new Date().toISOString().split('T')[0],
      location: {
        latitude: 24.9167872,
        longitude: 74.62912,
        validation: {
          isValid: true,
          matchedLocation: "Current Location",
          distance: 0,
          allowedRadius: 100
        }
      },
      type: "punch_in",
      timestamp: new Date().toISOString()
    };

    console.log("🌐 Testing actual timesheet format:", timesheetData);
    
    try {
      const response = await fetch(testUrl, {
        method: "POST",
        headers: {
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODZiOTY5ZmE5YTA5ZWM2YWE1MjM3MmIiLCJlbWFpbCI6Im1lZW5ha3NoaUB0ZXF1aXR5LnRlY2giLCJyb2xlIjoiRW1wbG95ZWUiLCJuYW1lIjoiTWVlbmFrc2hpIEd1cmphciIsImlhdCI6MTc1ODA5ODc0NCwiZXhwIjoxNzU4NTMwNzQ0fQ.M5NzKCzJ5Aeeg2n5RolcNIFlOuGHlsUY14H1w5WX1RE",
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "Timesheet-Proxy-Test/1.0.0",
          "x-user-role": "Employee"
        },
        body: JSON.stringify(timesheetData)
      });

      const responseText = await response.text();
      
      res.json({
        testUrl: testUrl,
        status: response.status,
        statusText: response.statusText,
        response: responseText,
        requestBody: timesheetData,
        headers: Object.fromEntries(response.headers.entries())
      });

    } catch (error) {
      res.json({
        error: error.message,
        testUrl: testUrl,
        requestBody: timesheetData
      });
    }

  } catch (error) {
    console.error("❌ Test error:", error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Proxy to your main timesheet API
const TIMESHEET_API_BASE = process.env.TIMESHEET_API_URL || "";

// Location validation configuration
const LOCATION_CONFIG = {
  // Default location (Jodhpur)
  DEFAULT_LATITUDE: parseFloat(process.env.LATITUDE) || 26.257544,
  DEFAULT_LONGITUDE: parseFloat(process.env.LONGITUDE) || 73.009617,
  DEFAULT_RADIUS: parseFloat(process.env.RADIUS) || 100, // in meters
  
  // Mumbai location
  MUMBAI_LATITUDE: parseFloat(process.env.MUMBAI_LATITUDE) || 19.184251792428768,
  MUMBAI_LONGITUDE: parseFloat(process.env.MUMBAI_LONGITUDE) || 72.8313642,
  MUMBAI_RADIUS: parseFloat(process.env.MUMBAI_RADIUS) || 100, // in meters
  
  // Current location (where you are now)
  CURRENT_LATITUDE: parseFloat(process.env.CURRENT_LATITUDE) || 24.9167872,
  CURRENT_LONGITUDE: parseFloat(process.env.CURRENT_LONGITUDE) || 74.62912,
  CURRENT_RADIUS: parseFloat(process.env.CURRENT_RADIUS) || 100 // in meters
};

// Validate API base URL
if (!TIMESHEET_API_BASE) {
  console.warn("⚠️  WARNING: TIMESHEET_API_URL environment variable is not set!");
  console.warn("⚠️  Set it with: TIMESHEET_API_URL=https://your-api-url.com node timesheet-server.js");
}

// Utility function to calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in meters
  return distance;
}

// Function to validate if the provided coordinates are within allowed locations
function validateLocation(userLatitude, userLongitude) {
  const locations = [
    {
      name: "Default Office",
      latitude: LOCATION_CONFIG.DEFAULT_LATITUDE,
      longitude: LOCATION_CONFIG.DEFAULT_LONGITUDE,
      radius: LOCATION_CONFIG.DEFAULT_RADIUS
    },
    {
      name: "Mumbai Office",
      latitude: LOCATION_CONFIG.MUMBAI_LATITUDE,
      longitude: LOCATION_CONFIG.MUMBAI_LONGITUDE,
      radius: LOCATION_CONFIG.MUMBAI_RADIUS
    },
    {
      name: "Current Location",
      latitude: LOCATION_CONFIG.CURRENT_LATITUDE,
      longitude: LOCATION_CONFIG.CURRENT_LONGITUDE,
      radius: LOCATION_CONFIG.CURRENT_RADIUS
    }
  ];

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
        allowedRadius: location.radius
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
    allowedRadius: closestLocation?.radius || 100,
    message: `You are ${Math.round(minDistance)}m away from the nearest allowed location (${closestLocation?.name}). Maximum allowed distance is ${closestLocation?.radius}m.`
  };
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

// Punch In API - Creates a timesheet entry for punch in
app.post("/api/v1/attendance/punchIn", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);
    
    console.log("📍 Punch In request received");
    console.log("🔑 Token:", mask(token));
    console.log("👤 User ID:", userId);
    console.log("👤 Role:", role);
    console.log("📋 Request headers:", req.headers);
    console.log("📋 Request body:", req.body);
    console.log("🍪 Cookies:", req.headers.cookie);
    
    if (!token) {
      console.log("❌ No token provided");
      return res.status(401).json({
        error: "Authentication required",
        message: "Provide Bearer token in Authorization header"
      });
    }

    const { latitude, longitude } = req.body;

    console.log("📍 Location data received:", { latitude, longitude });

    if (!latitude || !longitude) {
      console.log("❌ Missing location data");
      return res.status(400).json({
        error: "Location required",
        message: "Both latitude and longitude are required",
        received: { latitude, longitude }
      });
    }

    // Validate that latitude and longitude are numbers
    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    
    if (isNaN(latNum) || isNaN(lngNum)) {
      console.log("❌ Invalid location data - not numbers");
      return res.status(400).json({
        error: "Invalid location data",
        message: "Latitude and longitude must be valid numbers",
        received: { latitude, longitude }
      });
    }

    console.log("📍 Location:", { latitude, longitude });

    // Validate location coordinates
    const locationValidation = validateLocation(latitude, longitude);
    
    if (!locationValidation.isValid) {
      console.log("❌ Location validation failed:", locationValidation.message);
      return res.status(403).json({
        error: "Location not allowed",
        message: locationValidation.message,
        details: {
          userLocation: { latitude, longitude },
          closestLocation: locationValidation.closestLocation,
          distance: locationValidation.distance,
          allowedRadius: locationValidation.allowedRadius,
          validationFailed: true
        }
      });
    }

    console.log("✅ Location validation passed:", {
      matchedLocation: locationValidation.matchedLocation,
      distance: locationValidation.distance,
      allowedRadius: locationValidation.allowedRadius
    });

    // Check if API base URL is configured
    if (!TIMESHEET_API_BASE) {
      console.error("❌ TIMESHEET_API_BASE is not configured!");
      return res.status(500).json({
        error: "Server configuration error",
        message: "TIMESHEET_API_URL environment variable is not set",
        details: {
          hasApiBase: false,
          targetUrl: "undefined/api/v1/timesheet/createTimesheet"
        }
      });
    }

    // Use the correct punch in endpoint format
    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/attendance/punchIn`;
    
    // The target API expects simple latitude/longitude format
    const punchInData = {
      latitude: latNum,
      longitude: lngNum
    };
    
    console.log("🌐 Target URL:", targetUrl);
    console.log("🔧 TIMESHEET_API_BASE:", TIMESHEET_API_BASE);
    console.log("📤 Punch in data:", punchInData);
    
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Timesheet-Proxy-Server/1.0.0"
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    // Add user ID to headers if available
    const extractedUserId = req.body?.userId || req.headers['x-user-id'] || userId;
    if (extractedUserId) {
      headers["x-user-id"] = extractedUserId;
    }

    console.log("📤 Forwarding request to target API with headers:", headers);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(punchInData)
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
    console.log("✅ Punch in successful:", data);
    
    // Return the response from the target API directly
    return res.status(response.status).json(data);

  } catch (err) {
    console.error("❌ Punch in exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to punch in"
    });
  }
});

// Punch Out API - Creates a timesheet entry for punch out
app.post("/api/v1/attendance/punchOut", async (req, res) => {
  try {
    const { token, userId, role } = extractCredentials(req);
    
    console.log("📍 Punch Out request received");
    console.log("🔑 Token:", mask(token));
    console.log("👤 User ID:", userId);
    console.log("👤 Role:", role);
    console.log("📋 Request headers:", req.headers);
    console.log("📋 Request body:", req.body);
    console.log("🍪 Cookies:", req.headers.cookie);
    
    if (!token) {
      console.log("❌ No token provided");
      return res.status(401).json({
        error: "Authentication required",
        message: "Provide Bearer token in Authorization header"
      });
    }

    // Location data is optional for punch out, but we'll include it if provided
    const { latitude, longitude } = req.body;

    // Check if API base URL is configured
    if (!TIMESHEET_API_BASE) {
      console.error("❌ TIMESHEET_API_BASE is not configured!");
      return res.status(500).json({
        error: "Server configuration error",
        message: "TIMESHEET_API_URL environment variable is not set",
        details: {
          hasApiBase: false,
          targetUrl: "undefined/api/v1/timesheet/createTimesheet"
        }
      });
    }

    // Use the correct punch out endpoint format
    const targetUrl = `${TIMESHEET_API_BASE}/api/v1/attendance/punchOut`;
    
    // The target API expects simple latitude/longitude format (optional for punch out)
    const punchOutData = {};
    if (latitude && longitude) {
      punchOutData.latitude = parseFloat(latitude);
      punchOutData.longitude = parseFloat(longitude);
    }
    
    console.log("🌐 Target URL:", targetUrl);
    console.log("🔧 TIMESHEET_API_BASE:", TIMESHEET_API_BASE);
    console.log("📤 Punch out data:", punchOutData);
    
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Timesheet-Proxy-Server/1.0.0"
    };

    if (role) {
      headers["x-user-role"] = role;
    }

    // Add user ID to headers if available
    const extractedUserId = req.body?.userId || req.headers['x-user-id'] || userId;
    if (extractedUserId) {
      headers["x-user-id"] = extractedUserId;
    }

    console.log("📤 Forwarding request to target API with headers:", headers);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(punchOutData)
    });

    console.log("📥 Target API response status:", response.status);
    console.log("📥 Target API response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Punch out error:", response.status, errorText);
      console.error("❌ Full error details:", {
        status: response.status,
        statusText: response.statusText,
        url: targetUrl,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText
      });
      
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
    console.log("✅ Punch out successful:", data);
    
    // Return the response from the target API directly
    return res.status(response.status).json(data);

  } catch (err) {
    console.error("❌ Punch out exception:", err);
    return res.status(500).json({
      error: String(err),
      message: "Failed to punch out"
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
  console.error("🚨 Error stack:", err.stack);
  console.error("🚨 Request details:", {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body
  });
  res.status(500).json({
    error: "Internal server error",
    message: String(err)
  });
});

// Catch-all handler for unmatched routes
app.use((req, res) => {
  console.error("🚨 Route not found:", req.method, req.url);
  res.status(404).json({
    error: "Route not found",
    message: `${req.method} ${req.url} not found`
  });
});

app.listen(PORT, () => {
  console.log(`✅ Timesheet API server running on http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Proxying to: ${TIMESHEET_API_BASE}`);
});