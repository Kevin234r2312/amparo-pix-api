// /api/pix/create.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const PAYEVO_URL = "https://apiv2.payevo.com.br/functions/v1/transactions";

// Dados padrão (neutros) — use seus dados oficiais (CNPJ da sua empresa/ONG)
const DEFAULT_CUSTOMER = {
  name: "Cliente",
  email: "payments@amparo.org",
  phone: "5511999999999",
  document: { number: "27865757000102", type: "CNPJ" },
  address: {
    street: "Rua X",
    streetNumber: "1",
    complement: "",
    zipCode: "11050100",
    neighborhood: "Centro",
    city: "Santos",
    state: "SP",
    country: "BR",
  },
};

function uniqueExternalRef() {
  return `pay-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    // aceitar amount (centavos) ou amountReais (reais)
    let amount = Number(body.amount ?? 0);
    if ((!amount || isNaN(amount) || amount < 100) && body.amountReais) {
      amount = Math.round(Number(body.amountReais) * 100);
    }
    if (!amount || amount < 100) {
      return res.status(400).json({ error: "Valor mínimo: 100 centavos (R$1,00)." });
    }

    // Se o frontend enviar campos de cliente, usa; senão usa DEFAULT_CUSTOMER
    let customer = DEFAULT_CUSTOMER;
    if (body.name && body.email && body.cpf) {
      customer = {
        name: String(body.name),
        email: String(body.email),
        phone: String(body.phone ?? DEFAULT_CUSTOMER.phone),
        document: { number: String(body.cpf), type: "CPF" },
      };
    }

    const SECRET_KEY = process.env.PAYEVO_SECRET_KEY;
    if (!SECRET_KEY) {
      return res.status(500).json({ error: "Chave secreta não configurada." });
    }
    const encodedAuth = Buffer.from(`${SECRET_KEY}:x`).toString("base64");

    const externalRef = body.externalRef || uniqueExternalRef();
    const product = body.product || "Pagamento";

    const payload = {
      amount: Number(amount),
      paymentMethod: "PIX",
      description: body.description || `Pagamento ${product}`, // neutro
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        document: {
          number: String(customer.document.number),
          type: String(customer.document.type),
        },
        address: customer.address ?? undefined,
      },
      pix: { expiresInDays: 1 },
      items: [
        {
          title: product,
          quantity: 1,
          unitPrice: Number(amount),
          externalRef,
        },
      ],
      metadata: {
        source: body.source || "site",
        externalRef,
      },
      postbackUrl: process.env.POSTBACK_URL || null,
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || null,
    };

    const response = await fetch(PAYEVO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${encodedAuth}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro PayEvo:", data);
      return res.status(response.status).json({ error: "Erro ao criar transação", raw: data, sentPayload: payload });
    }

    // extrai brcode (pix qr raw)
    const brcode = data?.pix?.qrcode || data?.qrcode || data?.brcode || null;
    const qr_code_url = data?.pix?.qrcode
      ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.pix.qrcode)}`
      : data?.qr_code_url || null;

    return res.status(200).json({
      qr_code_url,
      brcode,
      transaction_id: data.id || data.transaction_id || null,
      status: data.status || "waiting_payment",
      // raw: data // remova em produção se não quiser expor detalhes
    });
  } catch (err: any) {
    console.error("Erro geral:", err);
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
}
