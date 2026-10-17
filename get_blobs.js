import { list } from '@vercel/blob';
import fs from 'fs';

async function main() {
  try {
    const { blobs } = await list({
      token: "vercel_blob_rw_IGLdBauRi3XjgeJr_VRkVHe7TlsDA58y3wDt3X7vCxOGOmw"
    });
    fs.writeFileSync('all_blobs.json', JSON.stringify(blobs, null, 2));
    console.log("Successfully wrote all_blobs.json");
  } catch (error) {
    console.error("Error listing blobs:", error);
  }
}

main();
