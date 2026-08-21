process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
(async () => {
  try {
    const res = await fetch('https://localhost:3030/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        syncId: "test-123",
        rawData: "test-data",
        scannedAt: new Date().toISOString()
      })
    });
    console.log("Status:", res.status);
    const data = await res.text();
    console.log("Response:", data);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
})();
