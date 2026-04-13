import { createServiceClient } from "@/lib/supabase/server"

interface Photo {
  id: string
  storage_path_original: string
  caption: string | null
  room_id: string | null
  move_in_photo_id: string | null
  inspection_rooms?: { room_label: string } | null
}

interface PhotoWithUrl extends Photo {
  signedUrl: string | null
  moveInUrl: string | null
  moveInCaption: string | null
}

async function getSignedUrl(supabase: Awaited<ReturnType<typeof createServiceClient>>, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("inspection-photos").createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

async function buildPhotoWithUrls(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  photo: Photo,
  moveInMap: Map<string, Photo>,
): Promise<PhotoWithUrl> {
  const [signedUrl, moveIn] = await Promise.all([
    getSignedUrl(supabase, photo.storage_path_original).catch(() => null),
    photo.move_in_photo_id ? moveInMap.get(photo.move_in_photo_id) : null,
  ])

  const moveInUrl = moveIn
    ? await getSignedUrl(supabase, moveIn.storage_path_original).catch(() => null)
    : null

  return {
    ...photo,
    signedUrl,
    moveInUrl,
    moveInCaption: moveIn?.caption ?? null,
  }
}

export async function PhotoComparison({ inspectionId, orgId }: { inspectionId: string; orgId: string }) {
  const supabase = await createServiceClient()

  const { data: photos, error } = await supabase
    .from("inspection_photos")
    .select("id, storage_path_original, caption, room_id, move_in_photo_id, inspection_rooms(room_label)")
    .eq("inspection_id", inspectionId)
    .eq("org_id", orgId)
    .order("display_order")

  if (error || !photos || photos.length === 0) return null

  const photosTyped = photos as unknown as Photo[]

  // Collect move_in_photo_ids that need to be fetched
  const moveInIds = photosTyped.map((p) => p.move_in_photo_id).filter((id): id is string => id !== null)

  let moveInMap = new Map<string, Photo>()
  if (moveInIds.length > 0) {
    const { data: moveInPhotos } = await supabase
      .from("inspection_photos")
      .select("id, storage_path_original, caption")
      .in("id", moveInIds)
      .eq("org_id", orgId)

    if (moveInPhotos) {
      moveInMap = new Map((moveInPhotos as unknown as Photo[]).map((p) => [p.id, p]))
    }
  }

  const photosWithUrls = await Promise.all(photosTyped.map((p) => buildPhotoWithUrls(supabase, p, moveInMap)))

  const hasComparisons = photosWithUrls.some((p) => p.moveInUrl)

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">
          Photos
          {hasComparisons && (
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">· before / after comparison</span>
          )}
        </h3>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {photosWithUrls.map((photo) => {
            const roomLabel = (photo.inspection_rooms as { room_label: string } | null)?.room_label

            if (photo.moveInUrl && photo.signedUrl) {
              return (
                <div key={photo.id} className="space-y-1">
                  {roomLabel && (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{roomLabel}</p>
                  )}
                  <div className="grid grid-cols-2 gap-1">
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.moveInUrl} alt={photo.moveInCaption ?? "Move-in photo"} className="h-full w-full object-cover" loading="lazy" />
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">Before</span>
                    </div>
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.signedUrl} alt={photo.caption ?? "Move-out photo"} className="h-full w-full object-cover" loading="lazy" />
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">After</span>
                    </div>
                  </div>
                  {(photo.caption ?? photo.moveInCaption) && (
                    <p className="text-[11px] text-muted-foreground">{photo.caption ?? photo.moveInCaption}</p>
                  )}
                </div>
              )
            }

            if (!photo.signedUrl) return null

            return (
              <div key={photo.id} className="space-y-1">
                {roomLabel && (
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{roomLabel}</p>
                )}
                <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.signedUrl} alt={photo.caption ?? "Inspection photo"} className="h-full w-full object-cover" loading="lazy" />
                </div>
                {photo.caption && (
                  <p className="text-[11px] text-muted-foreground">{photo.caption}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
