import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { deleteDocumentRecord, getDocuments, updateDocumentRecord, uploadDocument } from "@/lib/services";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("documents", "read");
  if ("error" in auth) return auth.error;

  const tag = request.nextUrl.searchParams.get("tag") ?? undefined;
  const docs = await getDocuments(tag);
  return jsonOk(docs);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? "create";

  try {
    if (action === "update") {
      const auth = await requireApiUser("documents", "upload");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateDocumentRecord(id, data, auth.user));
    }

    if (action === "delete") {
      const auth = await requireApiUser("documents", "upload");
      if ("error" in auth) return auth.error;
      await deleteDocumentRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }

    const auth = await requireApiUser("documents", "upload");
    if ("error" in auth) return auth.error;
    const doc = await uploadDocument(body, auth.user);
    return jsonOk(doc);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Document action failed");
  }
}
