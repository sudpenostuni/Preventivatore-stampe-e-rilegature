import { list } from '@vercel/blob';

async function main() {
  try {
    const { blobs } = await list({
      token: "vercel_blob_rw_IGLdBauRi3XjgeJr_VRkVHe7TlsDA58y3wDt3X7vCxOGOmw"
    });
    console.log(JSON.stringify(blobs, null, 2));
  } catch (error) {
    console.error("Error listing blobs:", error);
  }
}

main();
