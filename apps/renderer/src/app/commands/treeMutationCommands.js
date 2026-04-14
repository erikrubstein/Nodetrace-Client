import { useCallback } from 'react'
import { ApiError, api } from '../../lib/api'
import { blobFromUrl, createPreviewFile } from '../../lib/image'
import { buildClientTree, buildFocusPathContext, buildLayout, buildVisibleTree } from '../../lib/tree'

export function useTreeMutationCommands({
  applyTreePayload,
  beginLocalEventExpectation,
  focusPathMode,
  layoutNodes,
  loadTree,
  prepareCollapsedSelection,
  projectSettings,
  selectedNodeId,
  selectedNodeIdRef,
  selectedProjectId,
  setCanvasTransform,
  setProjects,
  setSelectedNodeId,
  setTree,
  tree,
  nodeImageEditSequenceRef,
  selectedLayoutAnchorRef,
}) {
  const applyNodeUpdate = useCallback((updatedNode) => {
    setTree((current) => {
      if (!current) {
        return current
      }

      const nextNodes = current.nodes.map((node) => (node.id === updatedNode.id ? { ...node, ...updatedNode } : node))
      return buildClientTree(current.project, nextNodes)
    })
  }, [setTree])

  const appendNodesToTree = useCallback((newNodes) => {
    setTree((current) => {
      if (!current) {
        return current
      }
      return buildClientTree(current.project, [...current.nodes, ...newNodes])
    })
  }, [setTree])

  const removeNodesFromTree = useCallback((nodeIds) => {
    const removeSet = new Set(nodeIds)
    setTree((current) => {
      if (!current) {
        return current
      }
      return buildClientTree(
        current.project,
        current.nodes.filter((node) => !removeSet.has(node.id)),
      )
    })
  }, [setTree])

  const updateProjectListNodeCount = useCallback((delta) => {
    if (!selectedProjectId || delta === 0) {
      return
    }
    setProjects((current) =>
      current.map((project) =>
        project.id === selectedProjectId
          ? { ...project, node_count: Math.max(0, Number(project.node_count || 0) + delta) }
          : project,
      ),
    )
  }, [selectedProjectId, setProjects])

  const applyProjectUpdate = useCallback((updatedProject) => {
    setTree((current) => (current ? { ...current, project: updatedProject } : current))
    setProjects((current) =>
      current.map((project) => (project.id === updatedProject.id ? { ...project, ...updatedProject } : project)),
    )
  }, [setProjects, setTree])

  const patchNodeRequest = useCallback(async (nodeId, payload, options = {}) => {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedNode = await api(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!options.skipApply) {
        applyNodeUpdate(updatedNode)
      }
      return updatedNode
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [applyNodeUpdate, beginLocalEventExpectation])

  const patchProjectSettingsRequest = useCallback(async (projectId, nextSettings) => {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedProject = await api(`/api/projects/${projectId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })

      applyProjectUpdate(updatedProject)
      return updatedProject
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [applyProjectUpdate, beginLocalEventExpectation])

  const saveNodeMediaEdits = useCallback(async (nodeId, mediaId, imageEdits) => {
    if (!nodeId || !mediaId) {
      return null
    }
    const sequenceKey = `${nodeId}:${mediaId}`
    const saveSequence = (nodeImageEditSequenceRef.current.get(sequenceKey) || 0) + 1
    nodeImageEditSequenceRef.current.set(sequenceKey, saveSequence)
    const rollbackLocalEvent = beginLocalEventExpectation()
    let updatedNode = null
    try {
      updatedNode = await api(`/api/nodes/${nodeId}/media/${mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageEdits }),
      })
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
    if (nodeImageEditSequenceRef.current.get(sequenceKey) === saveSequence) {
      applyNodeUpdate(updatedNode)
    }
    return updatedNode
  }, [applyNodeUpdate, beginLocalEventExpectation, nodeImageEditSequenceRef])

  const setPrimaryMediaRequest = useCallback(async (nodeId, mediaId) => {
    if (!nodeId || !mediaId) {
      return null
    }
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const updatedNode = await api(`/api/nodes/${nodeId}/media/${mediaId}/primary`, {
        method: 'POST',
      })
      applyNodeUpdate(updatedNode)
      return updatedNode
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [applyNodeUpdate, beginLocalEventExpectation])

  const removeNodeMediaRequest = useCallback(async (nodeId, mediaId) => {
    if (!nodeId || !mediaId) {
      return null
    }
    const performDelete = async () => {
      const rollbackLocalEvent = beginLocalEventExpectation()
      try {
        return await api(`/api/nodes/${nodeId}/media/${mediaId}`, {
          method: 'DELETE',
        })
      } catch (error) {
        rollbackLocalEvent()
        throw error
      }
    }

    try {
      const updatedNode = await performDelete()
      applyNodeUpdate(updatedNode)
      return updatedNode
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && selectedProjectId) {
        const refreshedTree = await loadTree(selectedProjectId, selectedNodeIdRef.current)
        const refreshedNode = refreshedTree?.nodes?.find((item) => item.id === nodeId) || null
        const mediaStillExists = refreshedNode?.media?.some((item) => item.id === mediaId)
        if (!mediaStillExists) {
          return refreshedNode
        }
        const updatedNode = await performDelete()
        applyNodeUpdate(updatedNode)
        return updatedNode
      }
      throw error
    }
  }, [applyNodeUpdate, beginLocalEventExpectation, loadTree, selectedProjectId, selectedNodeIdRef])

  const mergeNodeIntoPhotoRequest = useCallback(async (sourceNodeId, targetNodeId) => {
    if (!sourceNodeId || !targetNodeId || !selectedProjectId) {
      return null
    }

    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const payload = await api(`/api/nodes/${sourceNodeId}/merge-into-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetNodeId }),
      })
      applyTreePayload(payload.tree)
      setSelectedNodeId(payload.targetNodeId || targetNodeId)
      return payload
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [applyTreePayload, beginLocalEventExpectation, selectedProjectId, setSelectedNodeId])

  const extractNodeMediaToChildRequest = useCallback(async (nodeId, mediaId) => {
    if (!nodeId || !mediaId || !selectedProjectId) {
      return null
    }

    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      const payload = await api(`/api/nodes/${nodeId}/media/${mediaId}/extract`, {
        method: 'POST',
      })
      applyTreePayload(payload.tree)
      setSelectedNodeId(payload.newNodeId || null)
      return payload
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [applyTreePayload, beginLocalEventExpectation, selectedProjectId, setSelectedNodeId])

  const setProjectCollapsedStateRequest = useCallback(async (projectId, collapsed) => {
    const rollbackLocalEvent = beginLocalEventExpectation()
    try {
      return await api(`/api/projects/${projectId}/collapse-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collapsed }),
      })
    } catch (error) {
      rollbackLocalEvent()
      throw error
    }
  }, [beginLocalEventExpectation])

  const createNodeRequest = useCallback(async (projectId, parentId, payload = {}) => {
    return api(`/api/projects/${projectId}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentId,
        name: payload.name ?? 'New Node',
        notes: payload.notes ?? '',
        tags: payload.tags ?? '',
      }),
    })
  }, [])

  const moveNodeRequest = useCallback(async (nodeId, payload) => {
    return api(`/api/nodes/${nodeId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }, [])

  const setCollapsedRequest = useCallback(async (nodeId, collapsed) => {
    return api(`/api/nodes/${nodeId}/collapse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collapsed }),
    })
  }, [])

  const buildCollapsedNodes = useCallback((sourceNodes, updatedNode, updatedIds, collapsed) => {
    const updatedIdSet = new Set(updatedIds || [updatedNode.id])
    return (sourceNodes || []).map((node) => {
      if (node.id === updatedNode.id) {
        return { ...node, ...updatedNode }
      }
      if (updatedIdSet.has(node.id)) {
        return { ...node, collapsed }
      }
      return node
    })
  }, [])

  const preserveNodeCanvasPositionForNextNodes = useCallback((nextNodes, anchorNodeId) => {
    if (!anchorNodeId || !tree?.project) {
      return
    }

    const previousAnchorNode = layoutNodes.find((item) => item.id === anchorNodeId) || null
    if (!previousAnchorNode) {
      return
    }

    const nextTree = buildClientTree(tree.project, nextNodes)
    const nextFocusPathContext = focusPathMode
      ? buildFocusPathContext(nextTree.nodes, anchorNodeId)
      : { pathIds: null, nextById: null }
    const nextVisibleRoot = buildVisibleTree(nextTree.root, {
      focusPathIds: nextFocusPathContext.pathIds,
      focusNextById: nextFocusPathContext.nextById,
      selectedNodeId: anchorNodeId,
    })
    const nextLayout = buildLayout(nextVisibleRoot, projectSettings)
    const nextAnchorNode = nextLayout.nodes.find((item) => item.id === anchorNodeId) || null

    if (!nextAnchorNode) {
      selectedLayoutAnchorRef.current = { nodeId: anchorNodeId, x: null, y: null }
      return
    }

    setCanvasTransform((current) => ({
      ...current,
      x: current.x + (previousAnchorNode.x - nextAnchorNode.x) * current.scale,
      y: current.y + (previousAnchorNode.y - nextAnchorNode.y) * current.scale,
    }))
    selectedLayoutAnchorRef.current = {
      nodeId: anchorNodeId,
      x: nextAnchorNode.x,
      y: nextAnchorNode.y,
    }
  }, [focusPathMode, layoutNodes, projectSettings, selectedLayoutAnchorRef, setCanvasTransform, tree])

  const applyCollapsedState = useCallback((updatedNode, updatedIds, collapsed, options = {}) => {
    const nextNodes = buildCollapsedNodes(tree?.nodes, updatedNode, updatedIds, collapsed)
    const nextSelection = options.skipSelectionPreparation
      ? options.preparedSelection || null
      : prepareCollapsedSelection(nextNodes)
    const anchorNodeId = options.anchorNodeId || nextSelection?.nextPrimaryId || selectedNodeIdRef.current || selectedNodeId
    preserveNodeCanvasPositionForNextNodes(nextNodes, anchorNodeId)
    setTree((current) => {
      if (!current) {
        return current
      }

      return buildClientTree(current.project, nextNodes)
    })
  }, [
    buildCollapsedNodes,
    prepareCollapsedSelection,
    preserveNodeCanvasPositionForNextNodes,
    selectedNodeId,
    selectedNodeIdRef,
    setTree,
    tree?.nodes,
  ])

  const deleteNodeRequest = useCallback(async (nodeId) => api(`/api/nodes/${nodeId}`, { method: 'DELETE' }), [])

  const uploadPhotoFilesRequest = useCallback(async (projectId, files, targetNodeId, mode = 'photo_node', options = {}) => {
    const createdEntries = []

    for (const file of files) {
      const previewFile = await createPreviewFile(file)
      const formData = new FormData()
      if (mode === 'additional_photo') {
        formData.append('additionalPhotoOfId', targetNodeId)
        formData.append('additionalPhoto', 'true')
        formData.append('uploadMode', 'additional_photo')
      } else {
        formData.append('parentId', targetNodeId)
        formData.append('uploadMode', 'photo_node')
      }
      formData.append('name', '<untitled>')
      formData.append('notes', '')
      formData.append('tags', '')
      if (options.imageEdits) {
        formData.append('imageEdits', JSON.stringify(options.imageEdits))
      }
      if (options.templateId) {
        formData.append('templateId', options.templateId)
      }
      formData.append('file', file)
      if (previewFile) {
        formData.append('preview', previewFile)
      }

      const payload = await api(`/api/projects/${projectId}/photos`, {
        method: 'POST',
        body: formData,
      })
      const node = payload?.node || payload
      createdEntries.push({
        mode: payload?.mode || mode,
        node,
        createdNodeId: payload?.createdNodeId || (payload?.node ? null : node?.id) || null,
        mediaId: payload?.mediaId || null,
      })
    }

    return createdEntries
  }, [])

  const createDeleteSnapshot = useCallback(async (node) => {
    const nodes = []
    const files = []
    let fileIndex = 0

    async function walk(current) {
      const mediaEntries = []
      for (const mediaItem of current.media || []) {
        const imageFileKey = mediaItem.imageUrl ? `image-${fileIndex++}` : null
        const previewFileKey = mediaItem.previewUrl ? `preview-${fileIndex++}` : null

        if (imageFileKey) {
          const imageBlob = await blobFromUrl(mediaItem.imageUrl)
          files.push({
            key: imageFileKey,
            file: new File([imageBlob], mediaItem.originalFilename || `${current.name}.jpg`, {
              type: imageBlob.type || 'image/jpeg',
            }),
          })
        }

        if (previewFileKey) {
          const previewBlob = await blobFromUrl(mediaItem.previewUrl)
          files.push({
            key: previewFileKey,
            file: new File([previewBlob], mediaItem.originalFilename || `${current.name}-preview.jpg`, {
              type: previewBlob.type || 'image/jpeg',
            }),
          })
        }

        mediaEntries.push({
          id: mediaItem.id,
          is_primary: Boolean(mediaItem.isPrimary),
          sort_order: Number(mediaItem.sortOrder || 0),
          original_filename: mediaItem.originalFilename || null,
          image_file_key: imageFileKey,
          preview_file_key: previewFileKey,
          image_edits_json: mediaItem.imageEdits || null,
        })
      }

      nodes.push({
        id: current.id,
        parent_id: current.parent_id,
        type: current.type,
        name: current.name,
        notes: current.notes || '',
        tags_json: Array.isArray(current.tags) ? current.tags : [],
        review_status: current.reviewStatus || 'new',
        collapsed: Boolean(current.collapsed),
        media: mediaEntries,
        identification: current.identification
          ? {
              template_id: current.identification.templateId || null,
              template_name: current.identification.templateName || '',
              status: current.identification.status || 'incomplete',
              reviewed_field_count: Number(current.identification.reviewedFieldCount || 0),
              total_review_field_count: Number(current.identification.totalReviewFieldCount || 0),
              missing_required_count: Number(current.identification.missingRequiredCount || 0),
              fields: (current.identification.fields || []).map((field) => ({
                key: field.key,
                label: field.label,
                type: field.type,
                mode: field.mode || 'manual',
                value: field.value,
                reviewed: Boolean(field.reviewed),
                reviewed_by_user_id: field.reviewedByUserId || null,
                reviewed_at: field.reviewedAt || null,
                source: field.source || 'manual',
                ai_suggestion: field.aiSuggestion || null,
              })),
            }
          : null,
      })

      for (const child of current.children || []) {
        await walk(child)
      }
    }

    await walk(node)
    return {
      manifest: {
        version: 2,
        root_id: node.id,
        root_parent_id: node.parent_id,
        nodes,
      },
      files,
    }
  }, [])

  const restoreDeletedSubtree = useCallback(async (projectId, snapshot) => {
    const formData = new FormData()
    formData.append('manifest', JSON.stringify(snapshot.manifest))
    for (const item of snapshot.files) {
      formData.append(item.key, item.file)
    }

    return api(`/api/projects/${projectId}/subtree-restore`, {
      method: 'POST',
      body: formData,
    })
  }, [])

  return {
    appendNodesToTree,
    applyCollapsedState,
    applyNodeUpdate,
    applyProjectUpdate,
    buildCollapsedNodes,
    createDeleteSnapshot,
    createNodeRequest,
    deleteNodeRequest,
    extractNodeMediaToChildRequest,
    mergeNodeIntoPhotoRequest,
    moveNodeRequest,
    patchNodeRequest,
    patchProjectSettingsRequest,
    preserveNodeCanvasPositionForNextNodes,
    removeNodeMediaRequest,
    removeNodesFromTree,
    restoreDeletedSubtree,
    saveNodeMediaEdits,
    setCollapsedRequest,
    setPrimaryMediaRequest,
    setProjectCollapsedStateRequest,
    updateProjectListNodeCount,
    uploadPhotoFilesRequest,
  }
}
