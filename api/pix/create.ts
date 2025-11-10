import type { VercelRequest, VercelResponse } from "@vercel/node";

const PAYEVO_URL = "https://apiv2.payevo.com.br/functions/v1/transactions";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, description = "", campaign = "organico" } = req.body || {};

    if (!amount || amount < 100) {
      return res.status(400).json({ error: "Valor mínimo: 100 centavos (R$1,00)." });
    }

    const SECRET_KEY = process.env.PAYEVO_SECRET_KEY;
    if (!SECRET_KEY) {
      return res.status(500).json({ error: "Chave secreta não configurada no ambiente." });
    }

    // Cria o Basic Auth corretamente
    const auth = Buffer.from(SECRET_KEY).toString("base64");

    // Corpo da requisição PayEvo (ajuste conforme sua documentação)
    const payload = {
      amount, // em centavos
      currency: "BRL",
      payment_method: "PIX",
      capture: true,
      description: description || `Pagamento Pix R$ ${(amount / 100).toFixed(2)}`,
      metadata: {
        campaign,
        plataforma: "amparo",
      },
    };

    const gatewayResp = await fetch(PAYEVO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await gatewayResp.json();

    if (!gatewayResp.ok) {
      console.error("Erro PayEvo:", data);
      return res.status(gatewayResp.status).json({
        error: data?.message || data?.error || "Erro ao criar transação Pix.",
      });
    }

    // Normaliza nomes de campos
    const qrCodeUrl =
      data.qr_code_url ||
      data.qr_code_image ||
      (data.qr_code_base64 ? `data:image/png;base64,${data.qr_code_base64}` : null);

    const brcode =
      data.brcode || data.qrcode || data.qr_code || data.qr_code_text || null;

    if (!qrCodeUrl || !brcode) {
      console.warn("Resposta inesperada PayEvo:", data);
      return res.status(500).json({
        error: "Resposta do gateway sem QR Code/Copia e Cola",
        raw: data,
      });
    }

    return res.status(200).json({
      qr_code_url: qrCodeUrl,
      brcode,
      transaction_id: data.id || data.transaction_id || null,
      status: data.status || "pending",
    });
  } catch (err: any) {
    console.error("Erro geral:", err);
    return res.status(500).json({ error: err.message || "Erro interno." });
  }
}
