export default async (req, context) => {
  const url = new URL(req.url).searchParams.get('url');

  if (!url) {
    return new Response('Missing URL parameter', { status: 400 });
  }

  // Validate URL is from Maven repository
  if (!url.match(/^https?:\/\/repo[0-9]*\.maven\.org\/maven2\//i)) {
    return new Response('URL not allowed', { status: 403 });
  }

  // Only allow .jar and .pom files
  if (!url.match(/\.(jar|pom)$/i)) {
    return new Response('Only JAR and POM files allowed', { status: 403 });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return new Response('Failed to fetch: HTTP ' + response.status, { status: response.status });
    }

    const contentType = response.headers.get('content-type');

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET'
      }
    });
  } catch (error) {
    return new Response('Failed to fetch: ' + error.message, { status: 502 });
  }
};
