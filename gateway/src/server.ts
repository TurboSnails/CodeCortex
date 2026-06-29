import { createGatewayApp } from "./createServer.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4317);

async function main(): Promise<void> {
  const { app } = await createGatewayApp();
  await app.listen({ host: HOST, port: PORT });
  console.log(`CodeCortex gateway listening on http://${HOST}:${PORT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
