// api/pix/create.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const PAYEVO_URL = "https://apiv2.payevo.com.br/functions/v1/transactions";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ✅ Configuração CORS (necessária pro Framer)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ✅ Bloqueia métodos não permitidos
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ✅ Pega dados do corpo
    const { amount, description = "", campaign = "organico" } = req.body || {};

    // ✅ Valida valor mínimo
    if (!amount || amount < 100) {
      return res
        .status(400)
        .json({ error: "Valor mínimo: 100 centavos (R$1,00)." });
    }

    // ✅ Busca chave secreta do ambiente
    const SECRET_KEY = process.env.PAYEVO_SECRET_KEY;
    if (!SECRET_KEY) {
      return res
        .status(500)
        .json({ error: "Chave secreta não configurada no ambiente da Vercel." });
    }

    // ✅ Cria autenticação Base64
    const auth = Buffer.from(SECRET_KEY).toString("base64");

    // ✅ Corpo enviado pro PayEvo
    const payload = {
      amount, // em centavos
      currency: "BRL",
      payment_method: "PIX",
      capture: true,
      description:
        description || `Pagamento Pix R$ ${(amount / 100).toFixed(2)}`,
      metadata: {
        campaign,
        plataforma: "amparo",
      },
    };

    // ✅ Envia a requisição ao PayEvo
    const gatewayResp = await fetch(PAYEVO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await gatewayResp.json();

    // ✅ Mostra o erro real do PayEvo (modo debug)
    if (!gatewayResp.ok) {
      console.error("Erro PayEvo:", data);
      return res.status(gatewayResp.status).json({
        error: "Erro interno ao criar transação",
        raw: data, // 👈 Aqui aparece o conteúdo real da resposta do PayEvo
      });
    }

    // ✅ Mapeia campos possíveis do retorno
    const qrCodeUrl =
      data.qr_code_url ||
      data.qr_code_image ||
      (data.qr_code_base64
        ? `data:image/png;base64,${data.qr_code_base64}`
        : null);

    const brcode =
      data.brcode ||
      data.qrcode ||
      data.qr_code ||
      data.qr_code_text ||
      null;

    if (!qrCodeUrl || !brcode) {
      console.warn("⚠️ Resposta inesperada PayEvo:", data);
      return res.status(500).json({
        error: "Resposta do gateway sem QR Code/Copia e Cola",
        raw: data, // 👈 também devolve o corpo completo pra debug
      });
    }

    // ✅ Retorna os dados normalizados pro Framer
    return res.status(200).json({
      qr_code_url: qrCodeUrl,
      brcode,
      transaction_id: data.id || data.transaction_id || null,
      status: data.status || "pending",
    });
  } catch (err: any) {
    console.error("Erro geral:", err);
    return res
      .status(500)
      .json({ error: err.message || "Erro interno inesperado." });
  }
}
