const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    refresh_token: process.env.REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }),
});
const token = await tokenResponse.json();
if (!tokenResponse.ok) throw new Error(`OAuth refresh failed: ${token.error}`);

const item = `publishers/${process.env.PUBLISHER_ID}/items/${process.env.EXTENSION_ID}`;
const response = await fetch(`https://chromewebstore.googleapis.com/v2/${item}:fetchStatus`, {
  headers: { Authorization: `Bearer ${token.access_token}` },
});
const status = await response.json();
if (!response.ok) throw new Error(`Store status failed: ${JSON.stringify(status.error)}`);
console.log(JSON.stringify({
  itemId: status.itemId,
  published: status.publishedItemRevisionStatus,
  submitted: status.submittedItemRevisionStatus,
  uploadState: status.uploadState,
}, null, 2));
