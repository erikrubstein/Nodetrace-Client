export function buildTemplateFormState(template) {
  if (!template) {
    return {
      name: '',
      aiInstructions: '',
      parentDepth: 0,
      childDepth: 0,
      fields: [],
    }
  }

  return {
    name: template.name || '',
    aiInstructions: template.aiInstructions || '',
    parentDepth: Number(template.parentDepth || 0),
    childDepth: Number(template.childDepth || 0),
    fields:
      template.fields?.map((field) => ({
        id: `${template.id}-${field.key}`,
        key: field.key,
        label: field.label,
        type: field.type,
        mode: field.mode || 'manual',
        parentDepth: Number(field.parentDepth || 0),
        childDepth: Number(field.childDepth || 0),
      })) || [],
  }
}
