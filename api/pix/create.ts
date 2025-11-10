import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { amount } = req.body || {};
  if (!amount || amount < 100) {
    return res.status(400).json({ error: "Valor mínimo: 100 centavos (R$1,00)." });
  }

  const dummyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAAD0lEQVR4nO3BMQEAAADCoPVPbQhPoAAAAAAAAKcFQ1wAAZ8o7eQAAAABJRU5ErkJggg==";

  return res.status(200).json({
    qr_code_url: dummyPng,
    brcode: "00020126FAKEBR.CODE.PIX.TESTE",
    transaction_id: "tx_mock_123",
    status: "pending",
  });
}
