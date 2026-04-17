"use client"

import { useState, useTransition, useMemo } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { FormSelect } from "@/components/ui/FormSelect"
import {
  Star,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
  MessageSquare,
} from "lucide-react"
import type { DocumentTemplate } from "./page"
import {
  createDocumentTemplate,
  deleteDocumentTemplate,
  duplicateTemplateToOrg,
  toggleFavourite,
  setWhatsAppOptIn,
  setWhatsAppTone,
  uploadCustomLease,
} from "@/lib/actions/templates"

// ─── Prop types ─────────────────────────────────────────────────────────────

interface TemplatesClientProps {
  templates: DocumentTemplate[]
  favouriteIds: string[]
  orgTier: string | null
  customTemplatePath: string | null
  customTemplateFilename: string | null
  customTemplateUploadedAt: string | null
}

// ─── Merge fields list ───────────────────────────────────────────────────────

const MERGE_FIELDS = [
  "{{tenant.full_name}}",
  "{{unit.number}}",
  "{{property.name}}",
  "{{lease.rent_amount}}",
  "{{arrears.total}}",
  "{{today}}",
  "{{agent.name}}",
]

// ─── Category pill ───────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="secondary" className="text-xs shrink-0">
      {category}
    </Badge>
  )
}

// ─── Legal flag badge ────────────────────────────────────────────────────────

function LegalFlagBadge({
  flag,
}: {
  flag: "wet_ink_only" | "aes_recommended" | null
}) {
  if (!flag) return null
  if (flag === "wet_ink_only") {
    return (
      <Badge className="bg-red-100 text-red-700 border-0 text-xs shrink-0">
        Wet ink required
      </Badge>
    )
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 border-0 text-xs shrink-0">
      AES recommended
    </Badge>
  )
}

// ─── Template row ────────────────────────────────────────────────────────────

interface TemplateRowProps {
  template: DocumentTemplate
  isFavourited: boolean
  onFavouriteToggle: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onEdit?: (template: DocumentTemplate) => void
  onUse?: (template: DocumentTemplate) => void
}

function TemplateRow({
  template,
  isFavourited,
  onFavouriteToggle,
  onDuplicate,
  onDelete,
  onEdit,
  onUse,
}: TemplateRowProps) {
  const canEdit = template.scope === "organisation"
  const canDelete = template.is_deletable && template.scope === "organisation"

  return (
    <div className="flex items-start gap-3 py-3 px-3 rounded-lg hover:bg-muted/40 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryBadge category={template.category} />
          <span className="font-medium text-sm">{template.name}</span>
          {template.scope === "system" && (
            <Badge variant="outline" className="text-xs shrink-0">
              System
            </Badge>
          )}
          <LegalFlagBadge flag={template.legal_flag} />
        </div>
        {template.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {template.description}
          </p>
        )}
        {template.usage_count > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Used {template.usage_count} time{template.usage_count !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onFavouriteToggle(template.id)}
          className={cn(
            "p-1.5 rounded hover:bg-muted transition-colors",
            isFavourited ? "text-amber-400" : "text-muted-foreground"
          )}
          aria-label={isFavourited ? "Remove from favourites" : "Add to favourites"}
        >
          <Star
            className="size-4"
            fill={isFavourited ? "currentColor" : "none"}
          />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                aria-label="Template options"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            {onUse && (
              <DropdownMenuItem onClick={() => onUse(template)}>
                Use
              </DropdownMenuItem>
            )}
            {canEdit && onEdit && (
              <DropdownMenuItem onClick={() => onEdit(template)}>
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDuplicate(template.id)}>
              Duplicate to org
            </DropdownMenuItem>
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(template.id)}
                >
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ─── Filter + search bar ─────────────────────────────────────────────────────

interface FilterBarProps {
  categories: string[]
  activeCategory: string
  onCategoryChange: (cat: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
}

function FilterBar({
  categories,
  activeCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search templates…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["All", ...categories].map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onCategoryChange(cat)}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
              activeCategory === cat
                ? "bg-brand text-brand-foreground border-brand"
                : "bg-background text-muted-foreground border-border hover:border-brand/50"
            )}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Template list with filter/search + grouped sections ────────────────────

interface TemplateListProps {
  templates: DocumentTemplate[]
  favouriteIds: Set<string>
  onFavouriteToggle: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onEdit?: (template: DocumentTemplate) => void
  onUse?: (template: DocumentTemplate) => void
  showGrouped?: boolean
  systemLabel?: string
  orgLabel?: string
}

function TemplateList({
  templates,
  favouriteIds,
  onFavouriteToggle,
  onDuplicate,
  onDelete,
  onEdit,
  onUse,
  showGrouped = true,
  systemLabel = "System templates",
  orgLabel = "Your templates",
}: TemplateListProps) {
  const [activeCategory, setActiveCategory] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")

  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category))
    return Array.from(cats).sort()
  }, [templates])

  const filtered = useMemo(() => {
    let list = templates
    if (activeCategory !== "All") {
      list = list.filter((t) => t.category === activeCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [templates, activeCategory, searchQuery])

  const favourited = filtered.filter((t) => favouriteIds.has(t.id))
  const systemTemplates = filtered.filter(
    (t) => t.scope === "system" && !favouriteIds.has(t.id)
  )
  const orgTemplates = filtered.filter(
    (t) => t.scope === "organisation" && !favouriteIds.has(t.id)
  )

  const rowProps = {
    isFavourited: false,
    onFavouriteToggle,
    onDuplicate,
    onDelete,
    onEdit,
    onUse,
  }

  return (
    <div>
      <FilterBar
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No templates match your filter.
        </p>
      )}

      {favourited.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-3">
            Favourites
          </p>
          {favourited.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              {...rowProps}
              isFavourited={true}
            />
          ))}
        </div>
      )}

      {showGrouped ? (
        <>
          {systemTemplates.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-3">
                {systemLabel}
              </p>
              {systemTemplates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  {...rowProps}
                  isFavourited={false}
                />
              ))}
            </div>
          )}
          {orgTemplates.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-3">
                {orgLabel}
              </p>
              {orgTemplates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  {...rowProps}
                  isFavourited={false}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        filtered
          .filter((t) => !favouriteIds.has(t.id))
          .map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              {...rowProps}
              isFavourited={false}
            />
          ))
      )}
    </div>
  )
}

// ─── New / edit template modal ───────────────────────────────────────────────

interface TemplateModalProps {
  open: boolean
  onClose: () => void
  templateType: "letter" | "email" | "whatsapp"
  existingCategories: string[]
  editingTemplate: DocumentTemplate | null
}

function TemplateModal({
  open,
  onClose,
  templateType,
  existingCategories,
  editingTemplate,
}: TemplateModalProps) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(editingTemplate?.name ?? "")
  const [category, setCategory] = useState(editingTemplate?.category ?? "")
  const [subject, setSubject] = useState(editingTemplate?.subject ?? "")
  const [bodyHtml, setBodyHtml] = useState(editingTemplate?.body_html ?? "")
  const [cursorPos, setCursorPos] = useState<number | null>(null)

  const showSubject = templateType === "email"

  function insertMergeField(field: string) {
    if (cursorPos !== null) {
      const before = bodyHtml.slice(0, cursorPos)
      const after = bodyHtml.slice(cursorPos)
      const updated = before + field + after
      setBodyHtml(updated)
      setCursorPos(cursorPos + field.length)
    } else {
      setBodyHtml((prev) => prev + field)
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("name", name)
      fd.set("category", category)
      fd.set("body_html", bodyHtml)
      fd.set("template_type", templateType)
      if (showSubject) fd.set("subject", subject)

      const result = await createDocumentTemplate(fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Template created")
        onClose()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingTemplate ? "Edit template" : "New template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rent arrears reminder"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Category
            </label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Arrears, Maintenance, General"
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {existingCategories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          {showSubject && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Subject
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Rent arrears notice — {{property.name}}"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Body HTML
            </label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              onSelect={(e) =>
                setCursorPos((e.target as HTMLTextAreaElement).selectionStart)
              }
              rows={8}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand/40"
              placeholder="<p>Dear {{tenant.full_name}},</p>"
            />
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Click to insert merge field at cursor:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => insertMergeField(f)}
                  className="px-2 py-0.5 rounded bg-muted text-xs font-mono hover:bg-brand/10 hover:text-brand transition-colors"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !name || !category}>
              {isPending ? "Saving…" : "Save template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Leases tab ──────────────────────────────────────────────────────────────

interface LeaseTabProps {
  orgTier: string | null
  customTemplatePath: string | null
  customTemplateFilename: string | null
  customTemplateUploadedAt: string | null
}

function LeaseTab({
  orgTier,
  customTemplatePath,
  customTemplateFilename,
  customTemplateUploadedAt,
}: LeaseTabProps) {
  const [isPending, startTransition] = useTransition()
  const isOwner = orgTier === "owner"
  const hasPremiumLease = false // stub — extend from DB when needed
  const showUpgradePrompt = isOwner && !hasPremiumLease
  const showExistingLease = !showUpgradePrompt && customTemplatePath !== null
  const showUploadSection = !showUpgradePrompt && !showExistingLease

  function handlePreview() {
    toast.info("Preview coming soon")
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set("file", file)
      const result = await uploadCustomLease(fd)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Custom lease uploaded")
      }
    })
  }

  function handleRequestPersonalisation() {
    toast.info("Contact support@pleks.co.za to request Pleks personalisation")
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-sm mb-3">Standard Pleks leases</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            {
              name: "Pleks Residential Lease",
              description:
                "Standard residential lease compliant with the Rental Housing Act 50 of 1999 and CPA.",
            },
            {
              name: "Pleks Commercial Lease",
              description:
                "Commercial lease template for business tenants, including VAT provisions.",
            },
          ].map((lease) => (
            <Card key={lease.name}>
              <CardContent className="pt-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">{lease.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {lease.description}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={handlePreview}
                >
                  Preview
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-sm mb-3">Custom lease</h2>

        {showUpgradePrompt && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-4">
              <p className="font-medium text-sm">Upgrade to upload a custom lease</p>
              <p className="text-xs text-muted-foreground mt-1">
                Custom lease uploads are available on the Premium plan.
              </p>
              <Button variant="outline" size="sm" className="mt-3">
                View upgrade options
              </Button>
            </CardContent>
          </Card>
        )}

        {showExistingLease && (
          <Card>
            <CardContent className="pt-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-sm">
                  {customTemplateFilename ?? "Custom lease"}
                </p>
                {customTemplateUploadedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Uploaded{" "}
                    {new Date(customTemplateUploadedAt).toLocaleDateString(
                      "en-ZA",
                      { day: "numeric", month: "long", year: "numeric" }
                    )}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreview}
                >
                  Preview
                </Button>
                <label className="cursor-pointer inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all hover:bg-muted">
                  Replace
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    className="sr-only"
                    onChange={handleUpload}
                    disabled={isPending}
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        {showUploadSection && (
          <Card>
            <CardContent className="pt-4">
              <p className="font-medium text-sm mb-1">
                Upload your own lease
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Upload a PDF or DOCX. Max 10MB. This will be stored against
                your organisation and made available when generating lease
                documents.
              </p>
              <div className="flex gap-3">
                <label className="cursor-pointer inline-flex h-7 items-center gap-1.5 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all hover:bg-muted">
                  <Upload className="size-3.5" />
                  {isPending ? "Uploading…" : "Upload lease"}
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    className="sr-only"
                    onChange={handleUpload}
                    disabled={isPending}
                  />
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRequestPersonalisation}
                >
                  Request Pleks personalisation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── WhatsApp tab ────────────────────────────────────────────────────────────

interface WhatsAppTabProps {
  templates: DocumentTemplate[]
  favouriteIds: Set<string>
}

const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "firm", label: "Firm" },
]

function WhatsAppTab({ templates }: WhatsAppTabProps) {
  const [optIns, setOptIns] = useState<Record<string, boolean>>({})
  const [tones, setTones] = useState<Record<string, string>>({})
  const [, startTransition] = useTransition()

  function handleOptIn(templateId: string, value: boolean) {
    setOptIns((prev) => ({ ...prev, [templateId]: value }))
    startTransition(async () => {
      const result = await setWhatsAppOptIn(templateId, value)
      if (result.error) toast.error(result.error)
    })
  }

  function handleTone(templateId: string, tone: string) {
    setTones((prev) => ({ ...prev, [templateId]: tone }))
    startTransition(async () => {
      const result = await setWhatsAppTone(templateId, tone)
      if (result.error) toast.error(result.error)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
        <MessageSquare className="size-5 text-green-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm">Coming soon — WhatsApp integration</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            WhatsApp integration via Meta WABA is in progress. Your opt-in
            preferences are saved and will activate when ready.
          </p>
        </div>
      </div>

      {templates.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No WhatsApp templates available yet.
        </p>
      )}

      {templates.map((t) => {
        const isOptedIn = optIns[t.id] ?? false
        const activeTone = tones[t.id] ?? "professional"
        const bodyVariants = t.body_variants ?? {}
        const previewText =
          bodyVariants[activeTone] ?? t.whatsapp_body ?? t.name

        return (
          <Card key={t.id}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{t.name}</span>
                    <Badge
                      variant="secondary"
                      className="bg-green-100 text-green-700 border-0 text-xs"
                    >
                      Approved
                    </Badge>
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.description}
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {isOptedIn ? "Opted in" : "Opted out"}
                  </span>
                  <input
                    type="checkbox"
                    checked={isOptedIn}
                    onChange={(e) => handleOptIn(t.id, e.target.checked)}
                    className="size-4 accent-brand"
                  />
                </label>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground shrink-0">
                  Tone:
                </label>
                <FormSelect
                  options={TONE_OPTIONS}
                  value={activeTone}
                  onValueChange={(v) => handleTone(t.id, v)}
                  className="w-40 h-7 text-xs"
                />
              </div>

              {previewText && (
                <div className="flex justify-start">
                  <div className="bg-[#dcf8c6] text-[#111] rounded-lg rounded-tl-none px-3 py-2 max-w-xs text-xs leading-relaxed shadow-sm">
                    {previewText}
                    <div className="text-[10px] text-right text-gray-500 mt-1">
                      {new Date().toLocaleTimeString("en-ZA", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ─── Main client component ───────────────────────────────────────────────────

export function TemplatesClient({
  templates,
  favouriteIds: initialFavouriteIds,
  orgTier,
  customTemplatePath,
  customTemplateFilename,
  customTemplateUploadedAt,
}: TemplatesClientProps) {
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(
    new Set(initialFavouriteIds)
  )
  const [showNewModal, setShowNewModal] = useState(false)
  const [newModalType, setNewModalType] = useState<"letter" | "email">(
    "letter"
  )
  const [editingTemplate, setEditingTemplate] =
    useState<DocumentTemplate | null>(null)
  const [, startTransition] = useTransition()

  const letterTemplates = templates.filter((t) => t.template_type === "letter")
  const emailTemplates = templates.filter((t) => t.template_type === "email")
  const whatsappTemplates = templates.filter(
    (t) => t.template_type === "whatsapp"
  )

  const letterCategories = useMemo(
    () => Array.from(new Set(letterTemplates.map((t) => t.category))).sort(),
    [letterTemplates]
  )
  const emailCategories = useMemo(
    () => Array.from(new Set(emailTemplates.map((t) => t.category))).sort(),
    [emailTemplates]
  )

  function handleFavouriteToggle(id: string) {
    startTransition(async () => {
      const result = await toggleFavourite(id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setFavouriteIds((prev) => {
        const next = new Set(prev)
        if (result.favourited) {
          next.add(id)
        } else {
          next.delete(id)
        }
        return next
      })
    })
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateTemplateToOrg(id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Template duplicated to your organisation")
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteDocumentTemplate(id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Template deleted")
      }
    })
  }

  function handleUse(template: DocumentTemplate) {
    window.location.href = `/documents/new?template=${template.id}`
  }

  const sharedListProps = {
    favouriteIds,
    onFavouriteToggle: handleFavouriteToggle,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onEdit: setEditingTemplate,
    onUse: handleUse,
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl">Communication templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage letter, email, and WhatsApp templates used across Pleks.
          System templates are read-only; duplicate them to create editable
          copies.
        </p>
      </div>

      <Tabs defaultValue="letters">
        <TabsList className="mb-6">
          <TabsTrigger value="letters">Letters</TabsTrigger>
          <TabsTrigger value="leases">Leases</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>

        {/* ── Letters ── */}
        <TabsContent value="letters">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Letter templates</h2>
            <Button
              size="sm"
              onClick={() => {
                setNewModalType("letter")
                setShowNewModal(true)
              }}
            >
              <Plus className="size-4 mr-1.5" />
              New template
            </Button>
          </div>
          <TemplateList
            templates={letterTemplates}
            {...sharedListProps}
            showGrouped
            systemLabel="System templates"
            orgLabel="Your templates"
          />
        </TabsContent>

        {/* ── Leases ── */}
        <TabsContent value="leases">
          <LeaseTab
            orgTier={orgTier}
            customTemplatePath={customTemplatePath}
            customTemplateFilename={customTemplateFilename}
            customTemplateUploadedAt={customTemplateUploadedAt}
          />
        </TabsContent>

        {/* ── Emails ── */}
        <TabsContent value="emails">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm">Email templates</h2>
            <Button
              size="sm"
              onClick={() => {
                setNewModalType("email")
                setShowNewModal(true)
              }}
            >
              <Plus className="size-4 mr-1.5" />
              New template
            </Button>
          </div>
          <TemplateList
            templates={emailTemplates}
            {...sharedListProps}
            showGrouped
            systemLabel="Automated"
            orgLabel="Manual"
          />
        </TabsContent>

        {/* ── WhatsApp ── */}
        <TabsContent value="whatsapp">
          <WhatsAppTab
            templates={whatsappTemplates}
            favouriteIds={favouriteIds}
          />
        </TabsContent>
      </Tabs>

      {/* New/edit modal */}
      {(showNewModal || editingTemplate !== null) && (
        <TemplateModal
          open={showNewModal || editingTemplate !== null}
          onClose={() => {
            setShowNewModal(false)
            setEditingTemplate(null)
          }}
          templateType={editingTemplate?.template_type ?? newModalType}
          existingCategories={
            newModalType === "email" ? emailCategories : letterCategories
          }
          editingTemplate={editingTemplate}
        />
      )}
    </div>
  )
}
