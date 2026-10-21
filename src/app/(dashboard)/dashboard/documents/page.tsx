"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FileText, Lock, Plus, Search, Tag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { RowActions } from "@/components/crud/row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDocuments } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import type { Document } from "@/types";

const DOCUMENT_TAGS = ["SOP", "Finance", "Safety", "Contract", "HR", "Legal"];

type DocumentForm = {
  name: string;
  tag: string;
  file_url: string;
  is_restricted: boolean;
};

const emptyForm: DocumentForm = {
  name: "",
  tag: "SOP",
  file_url: "",
  is_restricted: false,
};

export default function DocumentsPage() {
  const { hasPermission } = useAuth();
  const canUpload = hasPermission("documents", "upload");

  const { data, isLoading, uploadMutation } = useDocuments();
  const allDocuments = (data ?? []) as Document[];

  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState<Document | null>(null);
  const [form, setForm] = useState<DocumentForm>(emptyForm);
  const [fileMode, setFileMode] = useState<"url" | "file">("url");

  const ALL_TAGS = useMemo(
    () => [...new Set([...DOCUMENT_TAGS, ...allDocuments.map((d) => d.tag)])],
    [allDocuments]
  );

  const documents = useMemo(() => {
    let filtered = allDocuments;
    if (tagFilter !== "all") {
      filtered = filtered.filter((d) => d.tag === tagFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.tag.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allDocuments, search, tagFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFileMode("url");
    setDialogOpen(true);
  };

  const openEdit = (doc: Document) => {
    setEditing(doc);
    setForm({
      name: doc.name,
      tag: doc.tag,
      file_url: doc.file_url,
      is_restricted: doc.is_restricted,
    });
    setDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, file_url: reader.result as string }));
    };
    reader.onerror = () => toast.error("Failed to read file");
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Document name is required");
      return;
    }
    if (!editing && !form.file_url.trim()) {
      toast.error("File URL or file upload is required");
      return;
    }

    if (editing) {
      uploadMutation.mutate(
        {
          action: "update",
          id: editing.id,
          name: form.name.trim(),
          tag: form.tag,
          is_restricted: form.is_restricted,
        },
        {
          onSuccess: () => {
            toast.success("Document updated");
            setDialogOpen(false);
          },
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : "Update failed"),
        }
      );
      return;
    }

    uploadMutation.mutate(
      {
        name: form.name.trim(),
        tag: form.tag,
        file_url: form.file_url.trim(),
        is_restricted: form.is_restricted,
      },
      {
        onSuccess: () => {
          toast.success("Document uploaded");
          setDialogOpen(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Upload failed"),
      }
    );
  };

  const handleDelete = () => {
    if (!deleting) return;
    uploadMutation.mutate(
      { action: "delete", id: deleting.id },
      {
        onSuccess: () => {
          toast.success("Document deleted");
          setDeleteOpen(false);
          setDeleting(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Delete failed"),
      }
    );
  };

  const handleView = (doc: Document) => {
    window.open(doc.file_url, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Documents"
        description="Central document repository with tags for SOPs, contracts, finance reports, and safety manuals."
        actions={
          canUpload ? (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />
              Upload Document
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter by tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {ALL_TAGS.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_TAGS.map((tag) => (
          <Badge
            key={tag}
            variant={tagFilter === tag ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setTagFilter(tagFilter === tag ? "all" : tag)}
          >
            <Tag className="mr-1 size-3" />
            {tag}
          </Badge>
        ))}
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Document Library
          </CardTitle>
          <CardDescription>
            {documents.length} document{documents.length !== 1 ? "s" : ""} in repository
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={documents}
            getRowKey={(row) => row.id}
            emptyMessage="No documents match your search criteria."
            columns={[
              {
                id: "name",
                header: "Name",
                cell: (row) => (
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="size-4" />
                    </div>
                    <span className="font-medium">{row.name}</span>
                  </div>
                ),
              },
              {
                id: "tag",
                header: "Tag",
                cell: (row) => <Badge variant="outline">{row.tag}</Badge>,
              },
              {
                id: "restricted",
                header: "Access",
                cell: (row) =>
                  row.is_restricted ? (
                    <Badge variant="warning" className="gap-1">
                      <Lock className="size-3" />
                      Restricted
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Open</span>
                  ),
              },
              {
                id: "linked",
                header: "Linked To",
                cell: (row) =>
                  row.entity_type ? (
                    <span className="text-xs capitalize text-muted-foreground">
                      {row.entity_type.replace(/_/g, " ")}
                    </span>
                  ) : (
                    "—"
                  ),
              },
              {
                id: "actions",
                header: "",
                headerClassName: "w-24",
                cell: (row) => (
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => handleView(row)}
                      title="View document"
                    >
                      <ExternalLink className="size-4" />
                    </Button>
                    {canUpload && (
                      <RowActions
                        onEdit={() => openEdit(row)}
                        onDelete={() => {
                          setDeleting(row);
                          setDeleteOpen(true);
                        }}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Document" : "Upload Document"}
        description={
          editing
            ? "Update document metadata."
            : "Add a new document to the repository."
        }
        submitLabel={editing ? "Save Changes" : "Upload"}
        isSubmitting={uploadMutation.isPending}
        onSubmit={handleSubmit}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-name">Name</Label>
            <Input
              id="doc-name"
              placeholder="Document name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-tag">Tag</Label>
            <Select
              value={form.tag}
              onValueChange={(value) => setForm((prev) => ({ ...prev, tag: value }))}
            >
              <SelectTrigger id="doc-tag">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_TAGS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!editing && (
            <>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={fileMode === "url" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFileMode("url")}
                >
                  URL
                </Button>
                <Button
                  type="button"
                  variant={fileMode === "file" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFileMode("file")}
                >
                  File Upload
                </Button>
              </div>

              {fileMode === "url" ? (
                <div className="space-y-2">
                  <Label htmlFor="doc-url">File URL</Label>
                  <Input
                    id="doc-url"
                    placeholder="https://... or /documents/file.pdf"
                    value={form.file_url}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, file_url: e.target.value }))
                    }
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="doc-file">Choose File</Label>
                  <Input
                    id="doc-file"
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                  />
                  {form.file_url && (
                    <p className="text-xs text-muted-foreground">File ready for upload</p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="doc-restricted"
              checked={form.is_restricted}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, is_restricted: checked === true }))
              }
            />
            <Label htmlFor="doc-restricted" className="cursor-pointer">
              Restricted access
            </Label>
          </div>
        </div>
      </EntityFormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Document"
        description={`Are you sure you want to delete "${deleting?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={uploadMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
