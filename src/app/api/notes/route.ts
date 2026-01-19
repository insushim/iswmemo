import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { awardPoints, checkAchievements } from "@/lib/gamification"

const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  contentType: z.enum(['text', 'markdown', 'rich']).default('text'),
  categoryId: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
  color: z.string().optional().nullable(),
  isPinned: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId')
    const tagId = searchParams.get('tagId')
    const isFavorite = searchParams.get('isFavorite') === 'true'
    const isArchived = searchParams.get('isArchived') === 'true'
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    const where: {
      userId: string
      isArchived: boolean
      OR?: { title?: { contains: string; mode: 'insensitive' }; content?: { contains: string; mode: 'insensitive' } }[]
      categoryId?: string
      isFavorite?: boolean
      tags?: { some: { tagId: string } }
    } = {
      userId: session.user.id,
      isArchived,
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (categoryId) where.categoryId = categoryId
    if (isFavorite) where.isFavorite = true
    if (tagId) {
      where.tags = { some: { tagId } }
    }

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        include: {
          category: true,
          tags: { include: { tag: true } },
        },
        orderBy: [
          { isPinned: 'desc' },
          { [sortBy]: sortOrder as 'asc' | 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.note.count({ where }),
    ])

    return NextResponse.json({
      notes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('GET /api/notes error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = createNoteSchema.parse(body)

    const note = await prisma.note.create({
      data: {
        title: validatedData.title,
        content: validatedData.content,
        contentType: validatedData.contentType,
        categoryId: validatedData.categoryId || null,
        color: validatedData.color || null,
        isPinned: validatedData.isPinned || false,
        isFavorite: validatedData.isFavorite || false,
        userId: session.user.id,
        tags: validatedData.tagIds ? {
          create: validatedData.tagIds.map(tagId => ({ tagId }))
        } : undefined,
      },
      include: {
        category: true,
        tags: { include: { tag: true } },
      },
    })

    // 포인트 지급 & 업적 체크
    await awardPoints(session.user.id, 'NOTE_CREATE')
    await checkAchievements(session.user.id, 'NOTES')

    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error('POST /api/notes error:', error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
