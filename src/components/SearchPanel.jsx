import { useEffect, useMemo, useRef, useState } from 'react'
import { collectDescendantIds, findNode } from '../lib/tree'

import IconButton from './IconButton'

const statusOptions = [
  { value: 'none', label: 'No template' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'reviewed', label: 'Complete' },
  { value: 'needs_attention', label: 'Needs Attention' },
]

const noteOptions = [
  { value: 'has_notes', label: 'Has Notes' },
  { value: 'no_notes', label: 'Has No Notes' },
]

const typeOptions = [
  { value: 'folder', label: 'Folder' },
  { value: 'photo', label: 'Photo' },
  { value: 'variant', label: 'Variant Photo' },
]

const variantOptions = [
  { value: 'has_variants', label: 'Has Variants' },
  { value: 'no_variants', label: 'No Variants' },
]

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
  selectedNodeId,
  selectedNodeIds,
  templates,
  tree,
  onSelectNode,
}) {
  const filterPopoverRef = useRef(null)
  const resultsRef = useRef(null)
  const [query, setQuery] = useState('')
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([])
  const [selectedOwnerUsernames, setSelectedOwnerUsernames] = useState([])
  const [anyTemplateOnly, setAnyTemplateOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [notesFilter, setNotesFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectionScopeFilter, setSelectionScopeFilter] = useState(false)
  const [variantPresenceFilter, setVariantPresenceFilter] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const activeFilterCount =
    Number(Boolean(anyTemplateOnly || selectedTemplateIds.length)) +
    Number(Boolean(statusFilter)) +
    Number(Boolean(notesFilter)) +
    Number(Boolean(typeFilter)) +
    Number(Boolean(selectionScopeFilter)) +
    Number(Boolean(variantPresenceFilter)) +
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
  const selectionScopeIds = useMemo(() => {
    if (!selectionScopeFilter || !tree?.root || !selectedNodeIds?.length) {
      return null
    }

    const scopedIds = new Set()
    for (const nodeId of selectedNodeIds) {
      const node = findNode(tree.root, nodeId)
      if (!node) {
        continue
      }
      for (const descendantId of collectDescendantIds(node)) {
        scopedIds.add(descendantId)
      }
    }
    return scopedIds
  }, [selectedNodeIds, selectionScopeFilter, tree])

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
        if (statusFilter === 'needs_attention') {
          return Boolean(node.needsAttention)
        }
        const status = node.identification?.status || 'none'
        if (statusFilter === 'incomplete') {
          return status === 'incomplete' || status === 'pending_review'
        }
        return status === statusFilter
      })
      .filter((node) => {
        if (!notesFilter) {
          return true
        }
        const hasNotes = Boolean(node.notes?.trim())
        return notesFilter === 'has_notes' ? hasNotes : !hasNotes
      })
      .filter((node) => {
        if (!selectionScopeIds) {
          return true
        }
        return selectionScopeIds.has(node.id)
      })
      .filter((node) => {
        if (!typeFilter) {
          return true
        }
        if (typeFilter === 'variant') {
          return Boolean(node.isVariant)
        }
        if (typeFilter === 'folder') {
          return node.type === 'folder' && !node.isVariant
        }
        if (typeFilter === 'photo') {
          return node.type === 'photo' && !node.isVariant
        }
        return true
      })
      .filter((node) => {
        if (!variantPresenceFilter) {
          return true
        }
        const hasVariants = Boolean(node.variants?.length)
        return variantPresenceFilter === 'has_variants' ? hasVariants : !hasVariants
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
  }, [anyTemplateOnly, notesFilter, query, selectedOwnerUsernames, selectedTemplateIds, selectionScopeIds, sortDirection, sortField, statusFilter, tree?.nodes, typeFilter, variantPresenceFilter])

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
                        setNotesFilter('')
                        setTypeFilter('')
                        setSelectionScopeFilter(false)
                        setVariantPresenceFilter('')
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
                      {noteOptions.map((option) =>
                        optionRow({
                          checked: notesFilter === option.value,
                          itemKey: option.value,
                          label: option.label,
                          onClick: () => setNotesFilter((current) => (current === option.value ? '' : option.value)),
                        }),
                      )}
                    </div>
                  </div>
                  <div className="search-panel__filter-group">
                    <span className="search-panel__filter-label">Type</span>
                    <div className="search-panel__option-list">
                      {typeOptions.map((option) =>
                        optionRow({
                          checked: typeFilter === option.value,
                          itemKey: option.value,
                          label: option.label,
                          onClick: () => setTypeFilter((current) => (current === option.value ? '' : option.value)),
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
                        label: 'Selected and Children',
                        onClick: () => setSelectionScopeFilter((current) => !current),
                      })}
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
                    <span className="search-panel__filter-label">Variants</span>
                    <div className="search-panel__option-list">
                      {variantOptions.map((option) =>
                        optionRow({
                          checked: variantPresenceFilter === option.value,
                          itemKey: option.value,
                          label: option.label,
                          onClick: () =>
                            setVariantPresenceFilter((current) => (current === option.value ? '' : option.value)),
                        }),
                      )}
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
                    {node.identification?.status === 'reviewed' ? (
                      <span className="search-panel__result-complete" aria-label="Complete" title="Complete">
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
