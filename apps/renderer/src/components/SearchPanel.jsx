import { useEffect, useMemo, useRef, useState } from 'react'
import { collectDescendantIds, findNode } from '../lib/tree'

import IconButton from './IconButton'

const SEARCH_SESSION_KEY_PREFIX = 'nodetrace-search-state'

const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'needs_attention', label: 'Needs Attention' },
]

const photoOptions = [
  { value: 'has_photos', label: 'Has Photos' },
  { value: 'one_photo', label: 'Has One Photo' },
  { value: 'no_photo', label: 'Has No Photos' },
]

function loadStoredSearchState(storageKey) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return JSON.parse(window.sessionStorage.getItem(storageKey) || 'null')
  } catch {
    return null
  }
}

function optionRow({ checked, itemKey, label, onClick, type = 'single' }) {
  return (
    <button
      key={itemKey}
      className={`search-panel__option-button ${checked ? 'search-panel__option-button--selected' : ''}`}
      onClick={onClick}
      type="button"
    >
      <span
        aria-hidden="true"
        className={`search-panel__option-indicator search-panel__option-indicator--${type} ${
          checked ? 'search-panel__option-indicator--selected' : ''
        }`}
      />
      <span>{label}</span>
    </button>
  )
}

export default function SearchPanel({
  bulkSelectNodeIds,
  onResultsChange,
  onSelectNode,
  projectId,
  selectedNodeId,
  selectedNodeIds,
  templates,
  tree,
}) {
  const filterPopoverRef = useRef(null)
  const resultsRef = useRef(null)
  const sessionHydratedRef = useRef(false)
  const storageKey = `${SEARCH_SESSION_KEY_PREFIX}:${projectId || 'global'}`
  const initialState = useMemo(() => loadStoredSearchState(storageKey), [storageKey])
  const [query, setQuery] = useState(() => (typeof initialState?.query === 'string' ? initialState.query : ''))
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState(() => (Array.isArray(initialState?.selectedTemplateIds) ? initialState.selectedTemplateIds : []))
  const [selectedTags, setSelectedTags] = useState(() =>
    Array.isArray(initialState?.selectedTags)
      ? initialState.selectedTags.filter((tag) => String(tag || '').trim().toLowerCase() !== 'any')
      : [],
  )
  const [anyTagOnly, setAnyTagOnly] = useState(() => Boolean(initialState?.anyTagOnly))
  const [selectedOwnerUsernames, setSelectedOwnerUsernames] = useState(() => (Array.isArray(initialState?.selectedOwnerUsernames) ? initialState.selectedOwnerUsernames : []))
  const [anyTemplateOnly, setAnyTemplateOnly] = useState(() => Boolean(initialState?.anyTemplateOnly))
  const [statusFilter, setStatusFilter] = useState(() => (typeof initialState?.statusFilter === 'string' ? initialState.statusFilter : ''))
  const [selectedNoteFilters, setSelectedNoteFilters] = useState(() =>
    Array.isArray(initialState?.selectedNoteFilters) ? initialState.selectedNoteFilters : [],
  )
  const [selectedPhotoFilters, setSelectedPhotoFilters] = useState(() =>
    Array.isArray(initialState?.selectedPhotoFilters) ? initialState.selectedPhotoFilters : [],
  )
  const [selectionScopeFilter, setSelectionScopeFilter] = useState(() => Boolean(initialState?.selectionScopeFilter))
  const [selectionScopeSeedIds, setSelectionScopeSeedIds] = useState(() =>
    Array.isArray(initialState?.selectionScopeSeedIds) ? initialState.selectionScopeSeedIds : [],
  )
  const [sortField, setSortField] = useState(() => (initialState?.sortField === 'added_at' ? 'added_at' : 'name'))
  const [sortDirection, setSortDirection] = useState(() => (initialState?.sortDirection === 'desc' ? 'desc' : 'asc'))
  const activeFilterCount =
    Number(Boolean(anyTemplateOnly || selectedTemplateIds.length)) +
    Number(Boolean(statusFilter)) +
    Number(Boolean(selectedNoteFilters.length)) +
    Number(Boolean(selectedPhotoFilters.length)) +
    Number(Boolean(selectionScopeFilter)) +
    Number(Boolean(anyTagOnly || selectedTags.length)) +
    Number(Boolean(selectedOwnerUsernames.length))

  const templateNameById = useMemo(
    () => new Map((templates || []).map((template) => [template.id, template.name])),
    [templates],
  )

  const ownerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (tree?.nodes || [])
            .map((node) => node.ownerUsername)
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [tree?.nodes],
  )

  const tagOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (tree?.nodes || [])
            .flatMap((node) => node.tags || [])
            .map((tag) => String(tag || '').trim())
            .filter((tag) => tag && tag.toLowerCase() !== 'any'),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [tree?.nodes],
  )

  useEffect(() => {
    sessionHydratedRef.current = true
  }, [])

  useEffect(() => {
    if (!sessionHydratedRef.current || typeof window === 'undefined') {
      return
    }

    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        query,
        selectedTemplateIds,
        selectedTags,
        anyTagOnly,
        selectedOwnerUsernames,
        anyTemplateOnly,
        statusFilter,
        selectedNoteFilters,
        selectedPhotoFilters,
        selectionScopeFilter,
        selectionScopeSeedIds,
        sortField,
        sortDirection,
      }),
    )
  }, [
    anyTagOnly,
    anyTemplateOnly,
    selectedNoteFilters,
    selectedPhotoFilters,
    query,
    selectedOwnerUsernames,
    selectedTags,
    selectedTemplateIds,
    selectionScopeFilter,
    selectionScopeSeedIds,
    sortDirection,
    sortField,
    statusFilter,
    storageKey,
  ])

  const selectionScopeIds = useMemo(() => {
    if (!selectionScopeFilter || !tree?.root || !selectionScopeSeedIds?.length) {
      return null
    }

    const scopedIds = new Set()
    for (const nodeId of selectionScopeSeedIds) {
      const node = findNode(tree.root, nodeId)
      if (!node) {
        continue
      }
      for (const descendantId of collectDescendantIds(node)) {
        scopedIds.add(descendantId)
      }
    }
    return scopedIds.size ? scopedIds : null
  }, [selectionScopeFilter, selectionScopeSeedIds, tree])

  const pinnedScopeCount = useMemo(
    () =>
      selectionScopeSeedIds.filter((nodeId, index, current) => current.indexOf(nodeId) === index).length,
    [selectionScopeSeedIds],
  )

  const results = useMemo(() => {
    const loweredQuery = query.trim().toLowerCase()

    return (tree?.nodes || [])
      .filter((node) => node.type !== 'collapsed-group')
      .filter((node) => !loweredQuery || node.name.toLowerCase().includes(loweredQuery))
      .filter((node) => {
        if (anyTemplateOnly) {
          return Boolean(node.identification?.templateId)
        }
        if (!selectedTemplateIds.length) {
          return true
        }
        return selectedTemplateIds.includes(node.identification?.templateId)
      })
      .filter((node) => {
        if (!statusFilter) {
          return true
        }
        return (node.reviewStatus || 'new') === statusFilter
      })
      .filter((node) => {
        if (!selectedNoteFilters.length) {
          return true
        }
        const hasNotes = Boolean(node.notes?.trim())
        return selectedNoteFilters.some((filterValue) => (filterValue === 'has_notes' ? hasNotes : !hasNotes))
      })
      .filter((node) => {
        if (anyTagOnly) {
          return Array.isArray(node.tags) && node.tags.length > 0
        }
        if (!selectedTags.length) {
          return true
        }
        return selectedTags.some((tag) => (node.tags || []).some((nodeTag) => nodeTag === tag))
      })
      .filter((node) => {
        if (!selectionScopeIds) {
          return true
        }
        return selectionScopeIds.has(node.id)
      })
      .filter((node) => {
        if (!selectedPhotoFilters.length) {
          return true
        }
        const mediaCount = Number(node.mediaCount || 0)
        return selectedPhotoFilters.some((filterValue) => {
          if (filterValue === 'no_photo') {
            return mediaCount === 0
          }
          if (filterValue === 'one_photo') {
            return mediaCount === 1
          }
          return mediaCount > 1
        })
      })
      .filter((node) => !selectedOwnerUsernames.length || selectedOwnerUsernames.includes(node.ownerUsername))
      .sort((left, right) => {
        let comparison = 0
        if (sortField === 'added_at') {
          comparison = String(left.added_at || '').localeCompare(String(right.added_at || ''))
        } else {
          comparison = left.name.localeCompare(right.name)
        }
        return sortDirection === 'desc' ? comparison * -1 : comparison
      })
  }, [
    anyTagOnly,
    anyTemplateOnly,
    query,
    selectedNoteFilters,
    selectedPhotoFilters,
    selectedOwnerUsernames,
    selectedTags,
    selectedTemplateIds,
    selectionScopeIds,
    sortDirection,
    sortField,
    statusFilter,
    tree?.nodes,
  ])

  useEffect(() => {
    onResultsChange?.(results.map((node) => node.id))
  }, [onResultsChange, results])

  useEffect(() => {
    if (!filterMenuOpen) {
      return undefined
    }

    function handlePointerDown(event) {
      if (filterPopoverRef.current?.contains(event.target)) {
        return
      }
      setFilterMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [filterMenuOpen])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return
      }

      const target = event.target
      const targetInResults = resultsRef.current?.contains(target)
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLButtonElement && !targetInResults) ||
        target?.isContentEditable
      ) {
        return
      }

      if (!results.length) {
        return
      }

      event.preventDefault()
      const currentIndex = results.findIndex((node) => node.id === selectedNodeId)
      const nextIndex =
        event.key === 'ArrowDown'
          ? currentIndex >= 0
            ? Math.min(currentIndex + 1, results.length - 1)
            : 0
          : currentIndex >= 0
            ? Math.max(currentIndex - 1, 0)
            : results.length - 1

      const nextNode = results[nextIndex]
      if (nextNode?.id && nextNode.id !== selectedNodeId) {
        void onSelectNode(nextNode.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSelectNode, results, selectedNodeId])

  return (
    <div className="search-panel">
      <section className="inspector__section search-panel__section">
        <div className="inspector__title">Filters</div>
        <label>
          <span>Name</span>
          <div className="search-panel__toolbar">
            <input
              placeholder="Search node names"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="search-panel__filter-popover-wrap">
              <div ref={filterPopoverRef}>
                <IconButton
                  aria-label="More filters"
                  className={`tool-button search-panel__filter-button ${filterMenuOpen || activeFilterCount ? 'is-active' : ''}`}
                  onClick={() => setFilterMenuOpen((current) => !current)}
                  tooltip="Filters"
                >
                  <i aria-hidden="true" className="fa-solid fa-filter" />
                </IconButton>
                {filterMenuOpen ? (
                  <div className="search-panel__filter-popover">
                    <div className="search-panel__filter-header">
                      <span>More Filters</span>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                          setAnyTemplateOnly(false)
                          setSelectedTemplateIds([])
                          setStatusFilter('')
                          setSelectedNoteFilters([])
                          setSelectedPhotoFilters([])
                          setSelectionScopeFilter(false)
                          setSelectionScopeSeedIds([])
                          setAnyTagOnly(false)
                          setSelectedTags([])
                          setSelectedOwnerUsernames([])
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="search-panel__filter-group">
                      <span className="search-panel__filter-label">Review Status</span>
                      <div className="search-panel__option-list">
                        {statusOptions.map((option) =>
                          optionRow({
                            checked: statusFilter === option.value,
                            itemKey: option.value,
                            label: option.label,
                            onClick: () => setStatusFilter((current) => (current === option.value ? '' : option.value)),
                          }),
                        )}
                      </div>
                    </div>
                    <div className="search-panel__filter-group">
                      <span className="search-panel__filter-label">Notes</span>
                      <div className="search-panel__option-list">
                        {[
                          { value: 'has_notes', label: 'Has Notes' },
                          { value: 'no_notes', label: 'Has No Notes' },
                        ].map((option) =>
                          optionRow({
                            checked: selectedNoteFilters.includes(option.value),
                            itemKey: option.value,
                            label: option.label,
                            onClick: () =>
                              setSelectedNoteFilters((current) =>
                                current.includes(option.value)
                                  ? current.filter((value) => value !== option.value)
                                  : [...current, option.value],
                              ),
                            type: 'multiple',
                          }),
                        )}
                      </div>
                    </div>
                    <div className="search-panel__filter-group">
                      <span className="search-panel__filter-label">Photos</span>
                      <div className="search-panel__option-list">
                        {photoOptions.map((option) =>
                          optionRow({
                            checked: selectedPhotoFilters.includes(option.value),
                            itemKey: option.value,
                            label: option.label,
                            onClick: () =>
                              setSelectedPhotoFilters((current) =>
                                current.includes(option.value)
                                  ? current.filter((value) => value !== option.value)
                                  : [...current, option.value],
                              ),
                            type: 'multiple',
                          }),
                        )}
                      </div>
                    </div>
                    <div className="search-panel__filter-group">
                      <span className="search-panel__filter-label">Scope</span>
                      <div className="search-panel__option-list">
                        {optionRow({
                          checked: selectionScopeFilter,
                          itemKey: 'selected-subtree',
                          label:
                            selectionScopeFilter && pinnedScopeCount
                              ? `Pinned Selection and Children (${pinnedScopeCount})`
                              : 'Pin Selection and Children',
                          onClick: () => {
                            if (selectionScopeFilter) {
                              setSelectionScopeFilter(false)
                              setSelectionScopeSeedIds([])
                              return
                            }
                            const snapshotIds = Array.from(new Set((selectedNodeIds || []).filter(Boolean)))
                            if (!snapshotIds.length) {
                              return
                            }
                            setSelectionScopeSeedIds(snapshotIds)
                            setSelectionScopeFilter(true)
                          },
                        })}
                      </div>
                    </div>
                    <div className="search-panel__filter-group">
                      <span className="search-panel__filter-label">Tags</span>
                      <div className="search-panel__option-list search-panel__option-list--scroll">
                        {optionRow({
                          checked: anyTagOnly,
                          itemKey: '__any_tag__',
                          label: 'Any',
                          onClick: () => {
                            setAnyTagOnly((current) => {
                              const nextValue = !current
                              if (nextValue) {
                                setSelectedTags([])
                              }
                              return nextValue
                            })
                          },
                          type: 'multiple',
                        })}
                        {tagOptions.map((tag) => (
                          <button
                            key={tag}
                            className={`search-panel__option-button ${
                              selectedTags.includes(tag) ? 'search-panel__option-button--selected' : ''
                            }`}
                            type="button"
                            onClick={() => {
                              setAnyTagOnly(false)
                              setSelectedTags((current) =>
                                current.includes(tag)
                                  ? current.filter((item) => item !== tag)
                                  : [...current, tag],
                              )
                            }}
                          >
                            <span
                              aria-hidden="true"
                              className={`search-panel__option-indicator search-panel__option-indicator--multiple ${
                                selectedTags.includes(tag) ? 'search-panel__option-indicator--selected' : ''
                              }`}
                            />
                            <span>{tag}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="search-panel__filter-group">
                      <span className="search-panel__filter-label">Owner</span>
                      <div className="search-panel__option-list search-panel__option-list--scroll">
                        {ownerOptions.map((ownerUsername) => (
                          <button
                            key={ownerUsername}
                            className={`search-panel__option-button ${
                              selectedOwnerUsernames.includes(ownerUsername) ? 'search-panel__option-button--selected' : ''
                            }`}
                            type="button"
                            onClick={() => {
                              setSelectedOwnerUsernames((current) =>
                                current.includes(ownerUsername)
                                  ? current.filter((username) => username !== ownerUsername)
                                  : [...current, ownerUsername],
                              )
                            }}
                          >
                            <span
                              aria-hidden="true"
                              className={`search-panel__option-indicator search-panel__option-indicator--multiple ${
                                selectedOwnerUsernames.includes(ownerUsername)
                                  ? 'search-panel__option-indicator--selected'
                                  : ''
                              }`}
                            />
                            <span>{ownerUsername}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="search-panel__filter-group">
                      <span className="search-panel__filter-label">Templates</span>
                      <div className="search-panel__option-list search-panel__option-list--scroll">
                        {optionRow({
                          checked: anyTemplateOnly,
                          itemKey: '__any__',
                          label: 'Any',
                          onClick: () => {
                            setAnyTemplateOnly((current) => {
                              const nextValue = !current
                              if (nextValue) {
                                setSelectedTemplateIds([])
                              }
                              return nextValue
                            })
                          },
                          type: 'multiple',
                        })}
                        {(templates || []).map((template) => (
                          <button
                            key={template.id}
                            className={`search-panel__option-button ${
                              selectedTemplateIds.includes(template.id) ? 'search-panel__option-button--selected' : ''
                            }`}
                            type="button"
                            onClick={() => {
                              setAnyTemplateOnly(false)
                              setSelectedTemplateIds((current) =>
                                current.includes(template.id)
                                  ? current.filter((id) => id !== template.id)
                                  : [...current, template.id],
                              )
                            }}
                          >
                            <span
                              aria-hidden="true"
                              className={`search-panel__option-indicator search-panel__option-indicator--multiple ${
                                selectedTemplateIds.includes(template.id) ? 'search-panel__option-indicator--selected' : ''
                              }`}
                            />
                            <span>{template.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </label>
        <div className="search-panel__sort-grid">
          <label>
            <span>Sort by</span>
            <select onChange={(event) => setSortField(event.target.value)} value={sortField}>
              <option value="name">Name</option>
              <option value="added_at">Date Added</option>
            </select>
          </label>
          <label>
            <span>Direction</span>
            <select onChange={(event) => setSortDirection(event.target.value)} value={sortDirection}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>
      </section>

      <section className="inspector__section search-panel__section search-panel__results-section">
        <div className="inspector__section-header">
          <div className="inspector__title">{results.length} RESULTS</div>
          <div className="search-panel__results-actions">
            <IconButton
              aria-label="Select all results"
              className="tool-button"
              disabled={!results.length}
              onClick={() => bulkSelectNodeIds(results.map((node) => node.id))}
              tooltip="Select All Results"
            >
              <i aria-hidden="true" className="fa-solid fa-check-double" />
            </IconButton>
          </div>
        </div>
        {results.length ? (
          <div ref={resultsRef} className="search-panel__results">
            {results.map((node, index) => (
              <button
                key={node.id}
                className={`search-panel__result ${index % 2 === 1 ? 'search-panel__result--alt' : ''} ${
                  selectedNodeId === node.id ? 'search-panel__result--selected' : ''
                }`}
                onClick={() => {
                  void onSelectNode(node.id)
                }}
                type="button"
              >
                <span className="search-panel__result-row">
                  <span className="search-panel__result-name">{node.name}</span>
                  <span className="search-panel__result-side">
                    {node.identification?.templateId ? (
                      <span className="search-panel__result-meta">
                        {templateNameById.get(node.identification.templateId) || 'Template'}
                      </span>
                    ) : null}
                    {node.reviewStatus === 'reviewed' ? (
                      <span className="search-panel__result-complete" aria-label="Reviewed" title="Reviewed">
                        <i aria-hidden="true" className="fa-solid fa-check" />
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="inspector__empty">No nodes match the current search.</div>
        )}
      </section>
    </div>
  )
}
