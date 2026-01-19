"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  Star,
  Archive,
  Trash2,
  Edit3,
  Save,
  X,
  MoreHorizontal
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import toast from "react-hot-toast"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import Link from "next/link"
import { use } from "react"

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

export default function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editedValues, setEditedValues] = useState<{
    title: string
    content: string
    color: string | null
  } | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const { data: note, isLoading, error } = useQuery<Note>({
    queryKey: ["note", id],
    queryFn: async () => {
      const res = await fetch(`/api/notes/${id}`)
      if (!res.ok) {
        if (res.status === 404) throw new Error("메모를 찾을 수 없습니다")
        throw new Error("메모를 불러오는데 실패했습니다")
      }
      return res.json()
    },
  })

  // 편집 중이면 editedValues 사용, 아니면 note 데이터 사용
  const editTitle = useMemo(() => editedValues?.title ?? note?.title ?? "", [editedValues, note])
  const editContent = useMemo(() => editedValues?.content ?? note?.content ?? "", [editedValues, note])
  const editColor = useMemo(() => editedValues?.color ?? note?.color ?? null, [editedValues, note])

  const setEditTitle = (title: string) => setEditedValues(prev => ({ ...prev, title, content: prev?.content ?? note?.content ?? "", color: prev?.color ?? note?.color ?? null }))
  const setEditContent = (content: string) => setEditedValues(prev => ({ ...prev, title: prev?.title ?? note?.title ?? "", content, color: prev?.color ?? note?.color ?? null }))
  const setEditColor = (color: string | null) => setEditedValues(prev => ({ ...prev, title: prev?.title ?? note?.title ?? "", content: prev?.content ?? note?.content ?? "", color }))

  const updateMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; color: string | null }) => {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("수정에 실패했습니다")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note", id] })
      queryClient.invalidateQueries({ queryKey: ["notes"] })
      setIsEditing(false)
      toast.success("메모가 수정되었습니다")
    },
    onError: () => {
      toast.error("메모 수정에 실패했습니다")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/notes/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("삭제에 실패했습니다")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] })
      toast.success("메모가 삭제되었습니다")
      router.push("/notes")
    },
    onError: () => {
      toast.error("메모 삭제에 실패했습니다")
    },
  })

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !note?.isFavorite }),
      })
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note", id] })
      queryClient.invalidateQueries({ queryKey: ["notes"] })
    },
  })

  const handleSave = () => {
    if (!editTitle.trim()) {
      toast.error("제목을 입력해주세요")
      return
    }
    updateMutation.mutate({ title: editTitle, content: editContent, color: editColor })
  }

  const handleCancel = () => {
    if (note) {
      setEditTitle(note.title)
      setEditContent(note.content)
      setEditColor(note.color)
    }
    setIsEditing(false)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  if (error || !note) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">메모를 찾을 수 없습니다</h2>
        <p className="text-muted-foreground mb-4">삭제되었거나 존재하지 않는 메모입니다</p>
        <Link href="/notes">
          <Button>
            <ArrowLeft className="w-4 h-4 mr-2" />
            메모 목록으로
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link href="/notes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            메모 목록
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                취소
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                저장
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleFavoriteMutation.mutate()}
              >
                <Star
                  className={`w-5 h-5 ${
                    note.isFavorite ? "fill-amber-500 text-amber-500" : ""
                  }`}
                />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                <Edit3 className="w-4 h-4 mr-2" />
                수정
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Archive className="w-4 h-4 mr-2" />
                    보관하기
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    삭제하기
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* 메모 내용 */}
      <Card
        className="overflow-hidden"
        style={{
          borderLeftWidth: 4,
          borderLeftColor: (isEditing ? editColor : note.color) || "#6366f1",
        }}
      >
        <CardContent className="p-6">
          {isEditing ? (
            <div className="space-y-4">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="메모 제목"
                className="text-xl font-bold border-none p-0 h-auto focus-visible:ring-0"
              />
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="메모 내용을 입력하세요..."
                className="min-h-[300px] border-none p-0 resize-none focus-visible:ring-0"
              />
              <div className="flex items-center gap-2 pt-4 border-t">
                <span className="text-sm text-muted-foreground mr-2">색상:</span>
                {colors.map((color) => (
                  <button
                    key={color.name}
                    onClick={() => setEditColor(color.value)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      editColor === color.value ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                    style={{ backgroundColor: color.value || "hsl(var(--card))" }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h1 className="text-2xl font-bold">{note.title}</h1>
              <div className="text-sm text-muted-foreground flex items-center gap-4">
                <span>
                  작성: {format(new Date(note.createdAt), "yyyy년 M월 d일 HH:mm", { locale: ko })}
                </span>
                {note.createdAt !== note.updatedAt && (
                  <span>
                    수정: {format(new Date(note.updatedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })}
                  </span>
                )}
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none pt-4 border-t">
                {note.content ? (
                  <p className="whitespace-pre-wrap">{note.content}</p>
                ) : (
                  <p className="text-muted-foreground italic">내용이 없습니다</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>메모 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 메모를 삭제하시겠습니까? 삭제된 메모는 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
