"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function uploadPropertyDocument(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const propertyId = formData.get("property_id") as string
  const documentType = formData.get("document_type") as string
  const expiryDate = formData.get("expiry_date") as string || null
  const notes = formData.get("notes") as string || null
  const file = formData.get("file") as File

  if (!file || !propertyId || !documentType) {
    return { error: "Missing required fields" }
  }

  // Get org_id
  const { data: property } = await supabase
    .from("properties")
    .select("org_id")
    .eq("id", propertyId)
    .single()

  if (!property) return { error: "Property not found" }

  const orgId = property.org_id
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
  const storagePath = `${orgId}/${propertyId}/${documentType}/${Date.now()}-${sanitizedName}`

  const { error: uploadError } = await supabase.storage
    .from("property-documents")
    .upload(storagePath, file, { cacheControl: "3600", upsert: false })

  if (uploadError) return { error: uploadError.message }

  const { error: dbError } = await supabase.from("property_documents").insert({
    org_id: orgId,
    property_id: propertyId,
    name: file.name,
    document_type: documentType,
    storage_path: storagePath,
    file_size: file.size,
    mime_type: file.type,
    expiry_date: expiryDate,
    notes,
    uploaded_by: user.id,
  })

  if (dbError) return { error: dbError.message }

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}

export async function deletePropertyDocument(documentId: string, propertyId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: doc } = await supabase
    .from("property_documents")
    .select("storage_path, org_id")
    .eq("id", documentId)
    .single()

  if (!doc) return { error: "Document not found" }

  // Delete from storage
  await supabase.storage.from("property-documents").remove([doc.storage_path])

  // Delete record
  await supabase.from("property_documents").delete().eq("id", documentId)

  // Audit
  await supabase.from("audit_log").insert({
    org_id: doc.org_id,
    table_name: "property_documents",
    record_id: documentId,
    action: "DELETE",
    changed_by: user.id,
  })

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}

export async function getDocumentSignedUrl(storagePath: string) {
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from("property-documents")
    .createSignedUrl(storagePath, 3600)

  return data?.signedUrl || null
}
