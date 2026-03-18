import { useCallback, useEffect, useRef, useState } from 'react'

export default function useNodeEditing({
  applyNodeUpdate,
  patchNodeRequest,
  pushHistory,
  selectedNode,
  setError,
  setSelectedNodeId,
  tree,
}) {
  const nameInputRef = useRef(null)
  const nodeSaveSequenceRef = useRef(new Map())
  const [editTargetId, setEditTargetId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', notes: '', tags: '' })

  const editTargetNode = tree?.nodes.find((node) => node.id === editTargetId) || null

  const saveNodeDraft = useCallback(
    async (node, draft) => {
      if (!node) {
        return
      }

      const normalizedName = draft.name.trim() || node.name
      const normalizedNotes = draft.notes.trim()
      const normalizedTags = draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .join(', ')
      const selectedTags = (node.tags || []).join(', ')

      if (
        normalizedName === node.name &&
        normalizedNotes === (node.notes || '') &&
        normalizedTags === selectedTags
      ) {
        return
      }

      try {
        const before = {
          name: node.name,
          notes: node.notes || '',
          tags: (node.tags || []).join(', '),
        }
        const after = {
          name: normalizedName,
          notes: draft.notes,
          tags: draft.tags,
        }

        const saveSequence = (nodeSaveSequenceRef.current.get(node.id) || 0) + 1
        nodeSaveSequenceRef.current.set(node.id, saveSequence)
        const updatedNode = await patchNodeRequest(node.id, after, { skipApply: true })
        if (nodeSaveSequenceRef.current.get(node.id) === saveSequence) {
          applyNodeUpdate(updatedNode)
        }
        pushHistory({
          undo: async () => {
            await patchNodeRequest(node.id, before)
            setSelectedNodeId(node.id)
          },
          redo: async () => {
            await patchNodeRequest(node.id, after)
            setSelectedNodeId(node.id)
          },
        })
      } catch (submitError) {
        setError(submitError.message)
      }
    },
    [applyNodeUpdate, patchNodeRequest, pushHistory, setError, setSelectedNodeId],
  )

  useEffect(() => {
    if (!selectedNode || !editTargetNode || selectedNode.id !== editTargetId) {
      return undefined
    }

    const timer = window.setTimeout(async () => {
      await saveNodeDraft(editTargetNode, editForm)
    }, 350)

    return () => {
      window.clearTimeout(timer)
    }
  }, [editForm, editTargetId, editTargetNode, saveNodeDraft, selectedNode])

  return {
    editForm,
    editTargetId,
    editTargetNode,
    nameInputRef,
    saveNodeDraft,
    setEditForm,
    setEditTargetId,
  }
}
