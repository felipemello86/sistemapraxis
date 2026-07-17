import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@praxis/core";
import { normalizeToFiveStars, addBusinessDays } from "@/lib/scoring";

// Portado de apps/booking-reviews/src/app/api/reviews/ingest/route.ts (v1).
// Endpoint de ingestão usado pelo fluxo de coleta manual/scriptada (Claude,
// via chat, e pelo script Python de coleta do Airbnb) para inserir
// avaliações do Booking.com e Airbnb. Autenticação simples via header
// x-api-key comparado a INGEST_API_KEY.
//
// Mudanças: `companyId` do corpo virou `tenantId` (contrato externo também
// precisa ser atualizado no script Python quando ele for portado pra v2 —
// já ia precisar mudar de qualquer forma pro novo domínio). `propertyLabel`
// continua com esse nome no contrato externo (é a label como o script/
// pessoa identificou a propriedade), mas por trás não cria mais uma
// propriedade nova — resolve por busca contra as UHs já cadastradas
// (UH.numero, mesmo padrão de findUHByNumero em tratamento/actions.ts). Se
// não achar nenhuma UH com esse número, a ingestão falha com erro 400 em vez
// de criar um cadastro solto — cadastro de UH é centralizado no gateway.

type IngestBody = {
  tenantId: string;
  platform: "BOOKING" | "AIRBNB";
  guestName: string;
  comment?: string;
  ratingRaw: number;
  ratingScaleMax?: number; // default 10
  propertyLabel: string; // obrigatório — precisa bater com o número/nome de uma UH já cadastrada
  checkInDate?: string;
  guestSubmittedAt: string; // data em que a avaliação chegou na OTA
};

async function resolveUHId(tenantId: string, label: string): Promise<string | null> {
  const existing = await prisma.uH.findFirst({
    where: { tenantId, ativo: true, numero: { equals: label, mode: "insensitive" } },
  });
  return existing?.id ?? null;
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as IngestBody | { items: IngestBody[] };
  const items = "items" in body ? body.items : [body];

  const created: string[] = [];
  for (const item of items) {
    if (!item.propertyLabel?.trim()) {
      return NextResponse.json(
        { error: `propertyLabel é obrigatório (avaliação de ${item.guestName})` },
        { status: 400 }
      );
    }

    const uhId = await resolveUHId(item.tenantId, item.propertyLabel.trim());
    if (!uhId) {
      return NextResponse.json(
        {
          error: `Nenhuma UH cadastrada com o número/nome "${item.propertyLabel}" (avaliação de ${item.guestName}). Cadastre a UH no gateway antes de tentar novamente.`,
        },
        { status: 400 }
      );
    }

    const ratingScaleMax = item.ratingScaleMax ?? 10;
    const ratingNormalized = normalizeToFiveStars(item.ratingRaw, ratingScaleMax);
    const guestSubmittedAt = new Date(item.guestSubmittedAt);

    const review = await prisma.review.create({
      data: {
        tenantId: item.tenantId,
        platform: item.platform,
        guestName: item.guestName,
        comment: item.comment,
        ratingRaw: item.ratingRaw,
        ratingScaleMax,
        ratingNormalized,
        uhId,
        checkInDate: item.checkInDate ? new Date(item.checkInDate) : undefined,
        guestSubmittedAt,
        collectedAt: new Date(),
        analysisDueAt: addBusinessDays(new Date(), 2),
      },
    });
    created.push(review.id);
  }

  return NextResponse.json({ created });
}
