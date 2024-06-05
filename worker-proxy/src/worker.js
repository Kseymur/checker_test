addEventListener('fetch', event => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const { request, env } = event;
  const url = new URL(request.url);
  const upstream = url.searchParams.get('upstream');
  if (!upstream) {
    return new Response("Missing 'upstream' parameter", { status: 400 });
  }

  const method = request.method;
  const headers = new Headers(request.headers);
  const body = method === 'GET' || method === 'HEAD' ? null : await request.arrayBuffer();

  const response = new Response("Request accepted and processing", { status: 202 });

  event.waitUntil(
    (async () => {
      try {
        const fetchResponse = await articleChecker.fetch(upstream, { method, headers, body });
        console.log(`Fetch to ${upstream} completed with status ${fetchResponse.status}`);
      } catch (error) {
        console.error(`Fetch to ${upstream} failed: ${error}`);
      }
    })()
  );

  return response;
}