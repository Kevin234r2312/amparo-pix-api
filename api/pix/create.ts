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
    // ====== CAPTURA DE DADOS DO FRONT ======
    const { amount, description, name, email, product, cpf } = req.body || {};

    if (!amount || amount < 100) {
      return res
        .status(400)
        .json({ error: "Valor mínimo: 100 centavos (R$1,00)." });
    }
    if (!name || !email || !product || !cpf) {
      return res
        .status(400)
        .json({ error: "Campos 'name', 'email', 'product' e 'cpf' são obrigatórios." });
    }

    // ====== CHAVE SECRETA ======
    const SECRET_KEY = process.env.PAYEVO_SECRET_KEY;
    if (!SECRET_KEY) {
      return res
        .status(500)
        .json({ error: "Chave secreta não configurada no ambiente da Vercel." });
    }

    const encodedAuth = Buffer.from(`${SECRET_KEY}:x`).toString("base64");

    // ====== PAYLOAD CONFORME SUPORTE PAYEVO ======
    const transactionData = {
      amount: Number(amount),
      paymentMethod: "PIX", // método em maiúsculo
      description: description || `Pagamento do produto ${product}`,
      customer: {
        name,
        email,
        phone: "+5511999999999",
        document: {
          number: cpf,
          type: "CPF"
        },
        address: {
          street: "Rua X",
          streetNumber: "1",
          complement: "",
          zipCode: "11050100",
          neighborhood: "Centro",
          city: "Santos",
          state: "SP",
          country: "BR"
        }
      },
      pix: {
        expiresInDays: 1
      },
      items: [
        {
          title: product,
          quantity: 1,
          unitPrice: Number(amount),
          externalRef: "PRODUTO0001"
        }
      ],
      metadata: {
        plataforma: "amparo",
        origin_campaign: "organico"
      },
      postbackUrl: "https://amparo.org/api/pix/callback",
      ip: "213.123.123.13"
    };

    // ====== REQUISIÇÃO ======
    const response = await fetch(PAYEVO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${encodedAuth}`
      },
      body: JSON.stringify(transactionData)
    });

    const data = await response.json();

    // ====== ERRO PAYEVO ======
    if (!response.ok) {
      console.error("Erro PayEvo:", data);
      return res.status(response.status).json({
        error: "Erro interno ao criar transação Pix",
        raw: data,
        sentPayload: transactionData
      });
    }

    // ====== TRATAMENTO DO RETORNO ======
    const qrCodeUrl =
      data.qr_code_url ||
      data.qr_code_image ||
      (data.qr_code_base64
        ? `data:image/png;base64,${data.qr_code_base64}`
        : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
            data?.pix?.qrcode || ""
          )}`);

    const brcode =
      data.brcode ||
      data.qrcode ||
      data.qr_code ||
      data.qr_code_text ||
      (data.pix && data.pix.qrcode) ||
      null;

    if (!brcode) {
      console.warn("⚠️ Resposta inesperada PayEvo:", data);
      return res.status(200).json({
        warning: "Transação criada, mas sem imagem base64. Use 'brcode' abaixo.",
        brcode: data?.pix?.qrcode,
        transaction_id: data.id,
        status: data.status
      });
    }

    // ====== RETORNO FINAL ======
    return res.status(200).json({
      qr_code_url: qrCodeUrl,
      brcode,
      transaction_id: data.id || data.transaction_id || null,
      status: data.status || "waiting_payment"
    });
  } catch (error: any) {
    console.error("Erro geral:", error);
    return res
      .status(500)
      .json({ error: error.message || "Erro interno inesperado." });
  }
}
