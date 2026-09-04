const http = require('http');

function makeRequest(path, method = 'GET') {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data
        });
      });
    });

    req.on('error', (e) => {
      resolve({ status: 500, data: e.message });
    });
    
    if (method === 'POST') {
      req.write(JSON.stringify({ email: 'test@example.com', password: 'password' }));
    }
    
    req.end();
  });
}

async function run() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  LIFE_SHARE — Phase 7 Rate Limit Tests');
  console.log('═════════════════════════════════════════════════════════════════\\n');

  try {
    // 1. Test Authentication Limiter (Max 10)
    console.log('[TESTING AUTH LIMITER]');
    let auth429Found = false;
    for (let i = 1; i <= 15; i++) {
      const res = await makeRequest('/api/auth/login', 'POST');
      if (res.status === 429) {
        auth429Found = true;
        const body = JSON.parse(res.data);
        if (body.error !== 'Too many requests. Please try again later.') {
          throw new Error('Unexpected 429 response body format');
        }
        break;
      }
    }
    if (auth429Found) {
      console.log('  ✅ Auth requests successfully rate limited (429) after 10 requests');
    } else {
      throw new Error('Auth rate limiter failed to trigger 429');
    }

    // 2. Test Public Directory Limiter (Max 100)
    console.log('[TESTING PUBLIC DIRECTORY LIMITER]');
    let public429Found = false;
    // We send up to 110 requests
    for (let i = 1; i <= 110; i++) {
      const res = await makeRequest('/api/hospitals?page=1&limit=1', 'GET');
      if (res.status === 429) {
        public429Found = true;
        const body = JSON.parse(res.data);
        if (body.error !== 'Too many requests. Please try again later.') {
          throw new Error('Unexpected 429 response body format');
        }
        break;
      }
    }
    if (public429Found) {
      console.log('  ✅ Public directory successfully rate limited (429) after 100 requests');
    } else {
      throw new Error('Public directory rate limiter failed to trigger 429');
    }

    console.log('\\n═════════════════════════════════════════════════════════════════');
    console.log('  RESULTS: 2 passed, 0 failed');
    console.log('  ✅ ALL RATE LIMIT TESTS PASSED');
    console.log('═════════════════════════════════════════════════════════════════\\n');

  } catch (err) {
    console.error(err);
    console.log('⚠️ RATE LIMIT TESTS FAILED');
    process.exit(1);
  }
}

run();
