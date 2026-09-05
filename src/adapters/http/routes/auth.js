import { LoginRequestSchema } from "../../../contracts/api.js";

export async function registerAuthRoutes(app, { login }) {
  app.post("/auth/login", async (request, reply) => {
    const body = LoginRequestSchema.parse(request.body);
    const result = await login(body);
    reply.send(result);
  });
}
