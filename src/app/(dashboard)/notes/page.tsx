"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  StickyNote,
  Plus,
  Search,
  Grid,
  List,
  Star,
  Archive,
  Trash2,
  MoreHorizontal,
  Filter
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import toast from "react-hot-toast"
import { format } from "date-fns"
import { ko } from "date-fns/locale"

interface Note {
  id: string
  title: string
  content: string
  color: string | null
  isPinned: boolean
  isFavorite: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
  category: { id: string; name: string } | null
  tags: { tag: { id: string; name: string; color: string } }[]
}

const colors = [
  { name: "기본", value: null },
  { name: "빨강", value: "#ef4444" },
  { name: "주황", value: "#f97316" },
  { name: "노랑", value: "#eab308" },
  { name: "초록", value: "#22c55e" },
  { name: "파랑", value: "#3b82f6" },
  { name: "보라", value: "#8b5cf6" },
  { name: "분홍", value: "#ec4899" },
]

export default function NotesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newNote, setNewNote] = useState({ title: "", content: "", color: null as string | null })

  const { data, isLoading } = useQuery({
    queryKey: ["notes", search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      const res = await fetch(`/api/notes?${params}`)
      if (!res.ok) throw new Error("Failed to fetch notes")
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (note: { title: string; content: string; color: string | null }) => {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note),
      })
      if (!res.ok) throw new Error("Failed to create note")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] })
      setIsCreateOpen(false)
      setNewNote({ title: "", content: "", color: null })
      toast.success("메모가 생성되었습니다")
    },
    onError: () => {
      toast.error("메모 생성에 실패했습니다")
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Note> }) => {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to update note")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notes/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete note")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] })
      toast.success("메모가 삭제되었습니다")
    },
    onError: () => {
      toast.error("메모 삭제에 실패했습니다")
    },
  })

  const handleToggleFavorite = (note: Note) => {
    updateMutation.mutate(
      { id: note.id, data: { isFavorite: !note.isFavorite } },
      {
        onSuccess: () => {
          toast.success(note.isFavorite ? "즐겨찾기 해제됨" : "즐겨찾기 추가됨")
        },
        onError: () => {
          toast.error("즐겨찾기 변경 실패")
        },
      }
    )
  }

  const handleToggleArchive = (note: Note) => {
    updateMutation.mutate(
      { id: note.id, data: { isArchived: !note.isArchived } },
      {
        onSuccess: () => {
          toast.success(note.isArchived ? "보관 해제됨" : "보관됨")
        },
        onError: () => {
          toast.error("보관 변경 실패")
        },
      }
    )
  }

  const handleDelete = (noteId: string) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate(noteId)
    }
  }

  const notes: Note[] = data?.notes || []

  const handleCreate = () => {
    if (!newNote.title.trim()) {
      toast.error("제목을 입력해주세요")
      return
    }
    createMutation.mutate(newNote)
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <StickyNote className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">메모</h1>
            <p className="text-sm text-muted-foreground">
              {notes.length}개의 메모
            </p>
          </div>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              새 메모
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>새 메모 작성</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">제목</Label>
                <Input
                  id="title"
                  placeholder="메모 제목"
                  value={newNote.title}
                  onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">내용</Label>
                <Textarea
                  id="content"
                  placeholder="메모 내용을 입력하세요..."
                  value={newNote.content}
                  onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Label>색상</Label>
                <div className="flex flex-wrap gap-2">
                  {colors.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => setNewNote({ ...newNote, color: color.value })}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        newNote.color === color.value ? "ring-2 ring-primary ring-offset-2" : ""
                      }`}
                      style={{ backgroundColor: color.value || "hsl(var(--card))" }}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "생성 중..." : "메모 생성"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 검색 및 필터 */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="메모 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon">
            <Filter className="w-4 h-4" />
          </Button>
          <div className="flex rounded-lg border">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 메모 목록 */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-12">
          <StickyNote className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">메모가 없습니다</h3>
          <p className="text-muted-foreground mb-4">
            첫 번째 메모를 작성해보세요
          </p>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            새 메모
          </Button>
        </div>
      ) : (
        <motion.div
          layout
          className={viewMode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "space-y-3"
          }
        >
          <AnimatePresence>
            {notes.map((note) => (
              <motion.div
                key={note.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <Card
                  className="group cursor-pointer card-hover overflow-hidden"
                  style={{ borderLeftColor: note.color || undefined, borderLeftWidth: note.color ? 4 : undefined }}
                >
                  <CardContent className={viewMode === "grid" ? "p-4" : "p-4 flex items-center gap-4"}>
                    {viewMode === "grid" ? (
                      <>
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold line-clamp-1">{note.title}</h3>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleToggleFavorite(note)}>
                                <Star className={`w-4 h-4 mr-2 ${note.isFavorite ? "fill-amber-500 text-amber-500" : ""}`} />
                                {note.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleArchive(note)}>
                                <Archive className="w-4 h-4 mr-2" />
                                {note.isArchived ? "보관 해제" : "보관"}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(note.id)}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-4 mb-3">
                          {note.content || "내용 없음"}
                        </p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{format(new Date(note.updatedAt), "M월 d일", { locale: ko })}</span>
                          <div className="flex gap-1">
                            {note.isFavorite && <Star className="w-3 h-3 fill-amber-500 text-amber-500" />}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className="w-2 h-12 rounded-full"
                          style={{ backgroundColor: note.color || "#6366f1" }}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{note.title}</h3>
                          <p className="text-sm text-muted-foreground truncate">
                            {note.content || "내용 없음"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(note.updatedAt), "M월 d일", { locale: ko })}
                        </span>
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}
