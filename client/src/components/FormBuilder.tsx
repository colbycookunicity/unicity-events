import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  ChevronDown, 
  ChevronUp,
  Type,
  Mail,
  Phone,
  List,
  CheckSquare,
  AlignLeft,
  Calendar,
  Hash
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface FormFieldDefinition {
  id?: string;
  name?: string; // Template fields use 'name' as identifier
  type: "text" | "email" | "phone" | "select" | "checkbox" | "textarea" | "date" | "number";
  label: string;
  labelEs?: string;
  placeholder?: string;
  placeholderEs?: string;
  required: boolean;
  options?: { value: string; label: string; labelEs?: string }[];
}

// Helper to get unique identifier for a field (supports both custom fields with 'id' and template fields with 'name')
const getFieldId = (field: FormFieldDefinition): string => {
  return field.id || field.name || `field_${Math.random().toString(36).substr(2, 9)}`;
};

interface FormBuilderProps {
  fields: FormFieldDefinition[];
  onChange: (fields: FormFieldDefinition[]) => void;
}

const fieldTypeIcons: Record<string, React.ReactNode> = {
  text: <Type className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  select: <List className="h-4 w-4" />,
  checkbox: <CheckSquare className="h-4 w-4" />,
  textarea: <AlignLeft className="h-4 w-4" />,
  date: <Calendar className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
};

const fieldTypeLabels: Record<string, string> = {
  text: "Text Input",
  email: "Email",
  phone: "Phone",
  select: "Dropdown",
  checkbox: "Checkbox",
  textarea: "Text Area",
  date: "Date",
  number: "Number",
};

function SortableFieldItem({ 
  field, 
  fieldId,
  isExpanded,
  onToggle,
  onUpdate, 
  onRemove 
}: { 
  field: FormFieldDefinition;
  fieldId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<FormFieldDefinition>) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: fieldId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const updateOption = (index: number, key: string, value: string) => {
    const newOptions = [...(field.options || [])];
    newOptions[index] = { ...newOptions[index], [key]: value };
    onUpdate({ options: newOptions });
  };

  const addOption = () => {
    const newOptions = [...(field.options || []), { value: `option_${Date.now()}`, label: "", labelEs: "" }];
    onUpdate({ options: newOptions });
  };

  const removeOption = (index: number) => {
    const newOptions = [...(field.options || [])];
    newOptions.splice(index, 1);
    onUpdate({ options: newOptions });
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="border rounded-md bg-card"
    >
      <div 
        className="flex items-center gap-2 p-3 cursor-pointer hover-elevate"
        onClick={onToggle}
      >
        <div 
          {...attributes} 
          {...listeners}
          className="cursor-grab touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {fieldTypeIcons[field.type]}
          <span className="font-medium truncate">{field.label || "Untitled Field"}</span>
          <Badge variant="secondary" className="shrink-0">
            {fieldTypeLabels[field.type]}
          </Badge>
          {field.required && (
            <Badge variant="outline" className="shrink-0">Required</Badge>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          data-testid={`button-remove-field-${fieldId}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
        
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-4 border-t">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Field Type</Label>
              <Select 
                value={field.type} 
                onValueChange={(value) => onUpdate({ type: value as FormFieldDefinition["type"] })}
              >
                <SelectTrigger data-testid={`select-field-type-${fieldId}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text Input</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="select">Dropdown</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                  <SelectItem value="textarea">Text Area</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <Switch
                id={`required-${fieldId}`}
                checked={field.required}
                onCheckedChange={(checked) => onUpdate({ required: checked })}
                data-testid={`switch-field-required-${fieldId}`}
              />
              <Label htmlFor={`required-${fieldId}`}>Required field</Label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Label (English)</Label>
              <Input
                value={field.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
                placeholder="Enter field label"
                data-testid={`input-field-label-${fieldId}`}
              />
            </div>
            <div className="space-y-2">
              <Label>Label (Spanish)</Label>
              <Input
                value={field.labelEs || ""}
                onChange={(e) => onUpdate({ labelEs: e.target.value })}
                placeholder="Ingrese la etiqueta"
                data-testid={`input-field-label-es-${fieldId}`}
              />
            </div>
          </div>

          {field.type !== "checkbox" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Placeholder (English)</Label>
                <Input
                  value={field.placeholder || ""}
                  onChange={(e) => onUpdate({ placeholder: e.target.value })}
                  placeholder="Enter placeholder text"
                  data-testid={`input-field-placeholder-${fieldId}`}
                />
              </div>
              <div className="space-y-2">
                <Label>Placeholder (Spanish)</Label>
                <Input
                  value={field.placeholderEs || ""}
                  onChange={(e) => onUpdate({ placeholderEs: e.target.value })}
                  placeholder="Ingrese texto de marcador"
                  data-testid={`input-field-placeholder-es-${fieldId}`}
                />
              </div>
            </div>
          )}

          {field.type === "select" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Dropdown Options</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOption}
                  data-testid={`button-add-option-${fieldId}`}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Option
                </Button>
              </div>
              
              {(field.options || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No options added yet. Click "Add Option" to create dropdown choices.</p>
              ) : (
                <div className="space-y-2">
                  {(field.options || []).map((option, index) => (
                    <div key={option.value} className="flex items-center gap-2">
                      <Input
                        value={option.label}
                        onChange={(e) => updateOption(index, "label", e.target.value)}
                        placeholder="Option label (English)"
                        className="flex-1"
                      />
                      <Input
                        value={option.labelEs || ""}
                        onChange={(e) => updateOption(index, "labelEs", e.target.value)}
                        placeholder="Spanish"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOption(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FormBuilder({ fields, onChange }: FormBuilderProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addField = (type: FormFieldDefinition["type"]) => {
    const newField: FormFieldDefinition = {
      id: `field_${Date.now()}`,
      type,
      label: "",
      required: false,
      options: type === "select" ? [] : undefined,
    };
    onChange([...fields, newField]);
    setExpandedId(newField.id);
  };

  const updateField = (id: string, updates: Partial<FormFieldDefinition>) => {
    onChange(fields.map(f => getFieldId(f) === id ? { ...f, ...updates } : f));
  };

  const removeField = (id: string) => {
    onChange(fields.filter(f => getFieldId(f) !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex(f => getFieldId(f) === active.id);
      const newIndex = fields.findIndex(f => getFieldId(f) === over.id);
      onChange(arrayMove(fields, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addField("text")} data-testid="button-add-text-field">
          <Type className="h-3 w-3 mr-1" /> Text
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addField("email")} data-testid="button-add-email-field">
          <Mail className="h-3 w-3 mr-1" /> Email
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addField("phone")} data-testid="button-add-phone-field">
          <Phone className="h-3 w-3 mr-1" /> Phone
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addField("number")} data-testid="button-add-number-field">
          <Hash className="h-3 w-3 mr-1" /> Number
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addField("select")} data-testid="button-add-select-field">
          <List className="h-3 w-3 mr-1" /> Dropdown
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addField("checkbox")} data-testid="button-add-checkbox-field">
          <CheckSquare className="h-3 w-3 mr-1" /> Checkbox
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addField("textarea")} data-testid="button-add-textarea-field">
          <AlignLeft className="h-3 w-3 mr-1" /> Text Area
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addField("date")} data-testid="button-add-date-field">
          <Calendar className="h-3 w-3 mr-1" /> Date
        </Button>
      </div>

      {fields.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No custom fields added yet. Use the buttons above to add form fields.
            </p>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={fields.map(f => getFieldId(f))} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {fields.map((field) => {
                const fieldId = getFieldId(field);
                return (
                  <SortableFieldItem
                    key={fieldId}
                    field={field}
                    fieldId={fieldId}
                    isExpanded={expandedId === fieldId}
                    onToggle={() => setExpandedId(expandedId === fieldId ? null : fieldId)}
                    onUpdate={(updates) => updateField(fieldId, updates)}
                    onRemove={() => removeField(fieldId)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
