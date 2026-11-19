// Cloudflare Pages project "smugless-demo-proxy": serves smugless.kuril.in by handing every
// request, unchanged, to the smugless-demo Worker through a service binding. Pages accepts a
// custom subdomain by CNAME even though kuril.in's DNS isn't on Cloudflare; a Worker doesn't.
export default {
  fetch(request, env) {
    return env.DEMO.fetch(request);
  },
};
