Deno.serve({ port: 5000 }, async (req) => {
  console.log('Request received:', req.url);
  return new Response('Hello World');
});
console.log('Server started on port 5000');
