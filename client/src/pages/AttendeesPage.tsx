import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearch, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Download, MoreHorizontal, Mail, Edit, Trash2, User, Shirt, Save, Pencil, ChevronUp, ChevronDown, Settings2, ArrowUpDown, Plus, Upload, Edit2, ArrowRightLeft, Copy, ExternalLink, Printer as PrinterIcon, CheckCircle2, XCircle, Clock, Send, HelpCircle, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import type { Registration, Event, SwagAssignmentWithDetails, QualifiedRegistrant, GuestAllowanceRule, FormTemplate, PrintLog, Printer } from "@shared/schema";

// Helper to format date-only fields without timezone shift
// Parses the date string and formats using UTC to avoid off-by-one errors
function formatDateOnly(dateValue: string | Date | null | undefined, formatStr: string = "MMM d, yyyy"): string {
  if (!dateValue) return "-";
  const dateStr = typeof dateValue === 'string' ? dateValue : dateValue.toISOString();
  // Extract just the date portion (YYYY-MM-DD) and parse at noon UTC to avoid timezone issues
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  // Create date at noon UTC to avoid any timezone boundary issues
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return format(utcDate, formatStr);
}

type UnifiedPerson = {
  type: "registration" | "qualifier";
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  unicityId: string | null;
  phone?: string | null;
  eventName?: string;
  registration?: Registration;
  qualifier?: QualifiedRegistrant & { eventName?: string };
  isRegistered: boolean;
};

const DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten_free", label: "Gluten Free" },
  { value: "dairy_free", label: "Dairy Free" },
  { value: "nut_allergy", label: "Nut Allergy" },
  { value: "shellfish_allergy", label: "Shellfish Allergy" },
  { value: "kosher", label: "Kosher" },
  { value: "halal", label: "Halal" },
];

// Standard registration fields that are stored as columns (not in formData)
const STANDARD_REGISTRATION_FIELDS = new Set([
  "unicityId", "email", "firstName", "lastName", "phone", "gender", "dateOfBirth",
  "shirtSize", "pantSize", "roomType", "passportNumber", "passportCountry", "passportExpiration",
  "emergencyContact", "emergencyContactPhone", "dietaryRestrictions", "adaAccommodations"
]);

// Fields that are part of contact info - already shown in Contact Information section
const CONTACT_INFO_FIELDS = new Set([
  "unicityId", "email", "firstName", "lastName", "phone", "gender", "dateOfBirth"
]);

// Helper function to format a field value for display
function formatFieldValue(value: unknown, fieldType?: string, options?: Array<{ value: string; label: string }>): string {
  if (value === null || value === undefined || value === "") return "-";
  
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "None";
  }
  
  // For select/radio fields with options, show the label instead of value
  if (options && typeof value === "string") {
    const option = options.find(o => o.value === value);
    if (option) return option.label;
  }
  
  return String(value);
}

// Helper to get field value from registration - checks both standard columns and formData
function getFieldValue(registration: Registration, fieldName: string): unknown {
  // First check standard registration columns
  if (STANDARD_REGISTRATION_FIELDS.has(fieldName)) {
    return (registration as Record<string, unknown>)[fieldName];
  }
  
  // Otherwise check formData JSON column
  const formData = (registration as Record<string, unknown>).formData as Record<string, unknown> | null;
  if (formData && fieldName in formData) {
    return formData[fieldName];
  }
  
  return undefined;
}

type ColumnKey = 
  | "name" | "unicityId" | "email" | "phone" | "gender" | "dateOfBirth"
  | "status" | "swagStatus" | "shirtSize" | "pantSize" | "roomType"
  | "passportNumber" | "passportCountry" | "passportExpiration"
  | "emergencyContact" | "emergencyContactPhone" | "dietaryRestrictions" | "adaAccommodations"
  | "dietaryPreference" | "dietaryNotes" | "language"
  | "registeredAt" | "checkedInAt" | "lastModified" | "verifiedByHydra" | "event" | "actions";

// Shared columns to show when "All Events" is selected (global view)
const SHARED_COLUMNS: ColumnKey[] = [
  "name", "status", "unicityId", "email", "phone", "event", "registeredAt", "lastModified", "swagStatus", "verifiedByHydra", "actions"
];

type SortConfig = {
  key: string;
  direction: "asc" | "desc";
} | null;

const ALL_COLUMNS: { key: ColumnKey; label: string; defaultVisible: boolean }[] = [
  { key: "name", label: "Name", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "unicityId", label: "Unicity ID", defaultVisible: false },
  { key: "email", label: "Email", defaultVisible: true },
  { key: "phone", label: "Phone", defaultVisible: true },
  { key: "gender", label: "Gender", defaultVisible: false },
  { key: "dateOfBirth", label: "Date of Birth", defaultVisible: false },
  { key: "event", label: "Event", defaultVisible: true },
  { key: "swagStatus", label: "Swag Status", defaultVisible: true },
  { key: "shirtSize", label: "Shirt Size", defaultVisible: false },
  { key: "pantSize", label: "Pant Size", defaultVisible: false },
  { key: "roomType", label: "Room Type", defaultVisible: false },
  { key: "passportNumber", label: "Passport Number", defaultVisible: false },
  { key: "passportCountry", label: "Passport Country", defaultVisible: false },
  { key: "passportExpiration", label: "Passport Expiration", defaultVisible: false },
  { key: "emergencyContact", label: "Emergency Contact", defaultVisible: false },
  { key: "emergencyContactPhone", label: "Emergency Phone", defaultVisible: false },
  { key: "dietaryRestrictions", label: "Dietary Restrictions", defaultVisible: false },
  { key: "dietaryPreference", label: "Dietary Preference", defaultVisible: false },
  { key: "dietaryNotes", label: "Dietary Notes", defaultVisible: false },
  { key: "adaAccommodations", label: "ADA Accommodations", defaultVisible: false },
  { key: "language", label: "Locale", defaultVisible: false },
  { key: "registeredAt", label: "Registered", defaultVisible: true },
  { key: "checkedInAt", label: "Checked In At", defaultVisible: false },
  { key: "lastModified", label: "Last Modified", defaultVisible: false },
  { key: "verifiedByHydra", label: "Verified by Hydra", defaultVisible: false },
  { key: "actions", label: "Actions", defaultVisible: true },
];

const STORAGE_KEY = "attendees-visible-columns";
const ORDER_STORAGE_KEY = "attendees-column-order";

// Sortable column item for drag-and-drop reordering
function SortableColumnItem({ 
  id, 
  label, 
  isVisible, 
  onToggle 
}: { 
  id: string; 
  label: string; 
  isVisible: boolean; 
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        data-testid={`drag-handle-column-${id}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox
        id={`col-${id}`}
        checked={isVisible}
        onCheckedChange={onToggle}
        data-testid={`checkbox-column-${id}`}
      />
      <Label htmlFor={`col-${id}`} className="text-sm font-normal cursor-pointer flex-1">
        {label}
      </Label>
    </div>
  );
}

export default function AttendeesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const searchParams = useSearch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [registrationStatusFilter, setRegistrationStatusFilter] = useState<string>("all");

  // User-scoped storage keys for column preferences
  const userStorageKey = user?.id ? `attendees-visible-columns-${user.id}` : STORAGE_KEY;
  const userOrderStorageKey = user?.id ? `attendees-column-order-${user.id}` : ORDER_STORAGE_KEY;
  
  // Initialize event filter from URL query parameter if present
  const initialEventId = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    return params.get("event") || "all";
  }, []);
  const [eventFilter, setEventFilter] = useState<string>(initialEventId);
  const [swagFilter, setSwagFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [selectedAttendee, setSelectedAttendee] = useState<Registration | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Registration>>({});
  
  const [qualifierDialogOpen, setQualifierDialogOpen] = useState(false);
  const [editingQualifier, setEditingQualifier] = useState<QualifiedRegistrant | null>(null);
  const [qualifierDeleteDialogOpen, setQualifierDeleteDialogOpen] = useState(false);
  const [qualifierToDelete, setQualifierToDelete] = useState<QualifiedRegistrant | null>(null);
  const [registrationDeleteDialogOpen, setRegistrationDeleteDialogOpen] = useState(false);
  const [registrationToDelete, setRegistrationToDelete] = useState<Registration | null>(null);
  const [sendCancellationEmail, setSendCancellationEmail] = useState(true);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkSendCancellationEmail, setBulkSendCancellationEmail] = useState(true);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [registrationToMove, setRegistrationToMove] = useState<Registration | null>(null);
  const [targetEventId, setTargetEventId] = useState<string>("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [csvData, setCsvData] = useState<Array<{ firstName: string; lastName: string; email: string; unicityId: string; locale: string }>>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [qualifierFormData, setQualifierFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    unicityId: "",
    guestAllowanceRuleId: "" as string | null,
  });
  
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>("");
  
  // Resend confirmation dialog state
  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [resendRegistration, setResendRegistration] = useState<Registration | null>(null);
  const [resendLanguage, setResendLanguage] = useState<string>("en");
  const [bulkResendDialogOpen, setBulkResendDialogOpen] = useState(false);
  const [bulkResendLanguage, setBulkResendLanguage] = useState<string>("en");
  
  // Helper to load visible columns from storage
  const loadVisibleColumns = useCallback((storageKey: string): Set<ColumnKey> => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return new Set(JSON.parse(saved) as ColumnKey[]);
      }
    } catch {}
    return new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
  }, []);

  // Helper to load column order from storage
  const loadColumnOrder = useCallback((storageKey: string): ColumnKey[] => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnKey[];
        const validKeys = new Set(ALL_COLUMNS.map(c => c.key));
        const filteredOrder = parsed.filter(k => validKeys.has(k));
        const savedSet = new Set(filteredOrder);
        ALL_COLUMNS.forEach(c => {
          if (!savedSet.has(c.key)) {
            filteredOrder.push(c.key);
          }
        });
        return filteredOrder;
      }
    } catch {}
    return ALL_COLUMNS.map(c => c.key);
  }, []);

  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => 
    loadVisibleColumns(userStorageKey)
  );

  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => 
    loadColumnOrder(userOrderStorageKey)
  );

  // Reload preferences when user changes (scoped per user)
  useEffect(() => {
    setVisibleColumns(loadVisibleColumns(userStorageKey));
    setColumnOrder(loadColumnOrder(userOrderStorageKey));
  }, [userStorageKey, userOrderStorageKey, loadVisibleColumns, loadColumnOrder]);

  // Save visible columns to user-scoped storage
  useEffect(() => {
    localStorage.setItem(userStorageKey, JSON.stringify(Array.from(visibleColumns)));
  }, [visibleColumns, userStorageKey]);

  // Save column order to user-scoped storage
  useEffect(() => {
    localStorage.setItem(userOrderStorageKey, JSON.stringify(columnOrder));
  }, [columnOrder, userOrderStorageKey]);

  // DnD sensors for column reordering
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id as ColumnKey);
        const newIndex = items.indexOf(over.id as ColumnKey);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  useEffect(() => {
    if (eventFilter === "all") {
      setQualifierDialogOpen(false);
      setQualifierDeleteDialogOpen(false);
      setImportDialogOpen(false);
      setEditingQualifier(null);
      setQualifierToDelete(null);
      setCsvData([]);
    }
    // Clear selection when event filter changes
    setSelectedPeople(new Set());
  }, [eventFilter]);

  // Clear selection when search or filters change
  useEffect(() => {
    setSelectedPeople(new Set());
  }, [searchQuery, statusFilter, registrationStatusFilter, swagFilter]);

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleRowClick = (person: UnifiedPerson) => {
    // For registered attendees, open the detail slider
    if (person.registration) {
      setSelectedAttendee(person.registration);
      setEditForm(person.registration);
      setIsEditing(false);
      setDrawerOpen(true);
    } else if (person.qualifier) {
      // For qualifiers (not registered), open the edit dialog
      handleEditQualifier(person.qualifier);
    }
  };

  const handleEditToggle = () => {
    if (selectedAttendee) {
      setEditForm(selectedAttendee);
      setIsEditing(true);
    }
  };

  const handleFormChange = (field: keyof Registration, value: any) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleDietaryChange = (option: string, checked: boolean) => {
    const current = editForm.dietaryRestrictions || [];
    const updated = checked 
      ? [...current, option]
      : current.filter(d => d !== option);
    setEditForm(prev => ({ ...prev, dietaryRestrictions: updated }));
  };

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const registrationsUrl = eventFilter === "all" 
    ? "/api/registrations" 
    : `/api/registrations?eventId=${eventFilter}`;
    
  const { data: registrations, isLoading } = useQuery<Registration[]>({
    queryKey: [registrationsUrl],
  });

  // Fetch event-specific qualifiers when an event is selected
  const { data: eventQualifiers } = useQuery<QualifiedRegistrant[]>({
    queryKey: [`/api/events/${eventFilter}/qualifiers`],
    enabled: eventFilter !== "all",
  });

  // Fetch all qualifiers across all events when "All Events" is selected (admin only)
  const { data: allQualifiers } = useQuery<(QualifiedRegistrant & { eventName: string })[]>({
    queryKey: ["/api/qualifiers"],
    enabled: eventFilter === "all",
  });

  // Use appropriate qualifiers based on filter
  const qualifiers = eventFilter === "all" ? allQualifiers : eventQualifiers;

  const { data: swagAssignments, isLoading: swagLoading, error: swagError } = useQuery<SwagAssignmentWithDetails[]>({
    queryKey: [`/api/registrations/${selectedAttendee?.id}/swag-assignments`],
    enabled: !!selectedAttendee && drawerOpen,
  });

  const { data: printLogs, isLoading: printLogsLoading } = useQuery<(PrintLog & { printer?: Printer })[]>({
    queryKey: [`/api/registrations/${selectedAttendee?.id}/print-logs`],
    enabled: !!selectedAttendee && drawerOpen,
  });

  const { data: eventPrinters } = useQuery<Printer[]>({
    queryKey: [`/api/events/${selectedAttendee?.eventId}/printers`],
    enabled: !!selectedAttendee && drawerOpen,
  });

  const printBadgeMutation = useMutation({
    mutationFn: async (data: { registrationId: string; printerId: string }) => {
      const response = await apiRequest("POST", "/api/print-bridge/print", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Badge sent to printer" });
      queryClient.invalidateQueries({ queryKey: [`/api/registrations/${selectedAttendee?.id}/print-logs`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Print failed",
        description: error.message,
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/registrations/${selectedAttendee?.id}/print-logs`] });
    },
  });
  
  // Debug logging for swag assignments
  if (drawerOpen && selectedAttendee) {
    console.log('[Swag Debug] Attendee:', selectedAttendee.id, selectedAttendee.email);
    console.log('[Swag Debug] Assignments:', swagAssignments);
    console.log('[Swag Debug] Loading:', swagLoading, 'Error:', swagError);
  }

  const selectedEvent = useMemo(() => 
    events?.find(e => e.id === eventFilter),
    [events, eventFilter]
  );

  const { data: formTemplates } = useQuery<FormTemplate[]>({
    queryKey: ["/api/form-templates"],
  });

  // Map form field names to column keys
  const FIELD_TO_COLUMN_MAP: Record<string, ColumnKey> = {
    unicityId: "unicityId",
    email: "email",
    phone: "phone",
    gender: "gender",
    dateOfBirth: "dateOfBirth",
    shirtSize: "shirtSize",
    pantSize: "pantSize",
    roomType: "roomType",
    passportNumber: "passportNumber",
    passportCountry: "passportCountry",
    passportExpiration: "passportExpiration",
    emergencyContact: "emergencyContact",
    emergencyContactPhone: "emergencyContactPhone",
    dietaryRestrictions: "dietaryRestrictions",
    adaAccommodations: "adaAccommodations",
  };

  // Get columns relevant to the selected event's form
  const eventFormFields = useMemo(() => {
    if (!selectedEvent) return null;
    
    // If event uses a template, get fields from template
    if (selectedEvent.formTemplateId && formTemplates) {
      const template = formTemplates.find(t => t.id === selectedEvent.formTemplateId);
      if (template?.fields) {
        return template.fields as Array<{ name: string; label?: string }>;
      }
    }
    
    // Otherwise use event's custom formFields
    if (selectedEvent.formFields && Array.isArray(selectedEvent.formFields)) {
      return selectedEvent.formFields as Array<{ name: string; label?: string }>;
    }
    
    return null;
  }, [selectedEvent, formTemplates]);

  // Compute which columns are relevant for this event
  const relevantColumns = useMemo(() => {
    // When "All Events" is selected, show only shared/global columns
    if (eventFilter === "all") {
      return new Set(SHARED_COLUMNS);
    }
    
    // Always include these base columns for specific event view (exclude "event" column)
    const alwaysVisible: ColumnKey[] = ["name", "email", "status", "registeredAt", "actions"];
    
    // If no form fields defined, show base columns plus operational ones
    if (!eventFormFields) {
      const defaultColumns: ColumnKey[] = [...alwaysVisible, "unicityId", "phone", "swagStatus", "checkedInAt", "lastModified", "verifiedByHydra"];
      return new Set(defaultColumns);
    }
    
    // Get column keys from form fields
    const formFieldNames = new Set(eventFormFields.map(f => f.name));
    const relevantFromForm: ColumnKey[] = [];
    
    for (const [fieldName, columnKey] of Object.entries(FIELD_TO_COLUMN_MAP)) {
      if (formFieldNames.has(fieldName)) {
        relevantFromForm.push(columnKey);
      }
    }
    
    // Include swagStatus, checkedInAt, lastModified, verifiedByHydra, and language for all events
    const additionalColumns: ColumnKey[] = ["swagStatus", "checkedInAt", "lastModified", "verifiedByHydra", "language"];
    
    return new Set([...alwaysVisible, ...relevantFromForm, ...additionalColumns]);
  }, [eventFormFields, eventFilter]);

  const { data: guestRules = [] } = useQuery<GuestAllowanceRule[]>({
    queryKey: [`/api/events/${eventFilter}/guest-rules`],
    enabled: eventFilter !== "all" && selectedEvent?.guestPolicy === "allowed_mixed",
  });

  const guestRulesById = useMemo(() => {
    const map = new Map<string, GuestAllowanceRule>();
    guestRules.forEach(r => map.set(r.id, r));
    return map;
  }, [guestRules]);

  const registeredEmails = useMemo(() => 
    new Set(registrations?.map(r => r.email.toLowerCase()) ?? []), 
    [registrations]
  );
  const registeredUnicityIds = useMemo(() => 
    new Set(registrations?.filter(r => r.unicityId).map(r => r.unicityId!) ?? []),
    [registrations]
  );

  const isQualifierRegistered = (qualifier: QualifiedRegistrant): boolean => {
    if (qualifier.unicityId && registeredUnicityIds.has(qualifier.unicityId)) {
      return true;
    }
    return registeredEmails.has(qualifier.email.toLowerCase());
  };

  const qualifiersByEmail = useMemo(() => {
    const map = new Map<string, QualifiedRegistrant>();
    qualifiers?.forEach(q => {
      map.set(q.email.toLowerCase(), q);
      if (q.unicityId) {
        map.set(`uid:${q.unicityId}`, q);
      }
    });
    return map;
  }, [qualifiers]);

  const findMatchingQualifier = (reg: Registration): QualifiedRegistrant | undefined => {
    if (reg.unicityId && qualifiersByEmail.has(`uid:${reg.unicityId}`)) {
      return qualifiersByEmail.get(`uid:${reg.unicityId}`);
    }
    return qualifiersByEmail.get(reg.email.toLowerCase());
  };

  // Create a map of event IDs to event names for quick lookup
  const eventNamesById = useMemo(() => {
    const map = new Map<string, string>();
    events?.forEach(e => map.set(e.id, e.name));
    return map;
  }, [events]);

  const unifiedPeople = useMemo((): UnifiedPerson[] => {
    const people: UnifiedPerson[] = [];
    const processedQualifierIds = new Set<string>();

    // Track registered emails/IDs for deduplication when showing all events
    const registeredEmailEventPairs = new Set<string>();
    const registeredUnicityIdEventPairs = new Set<string>();

    registrations?.forEach(reg => {
      const matchingQualifier = findMatchingQualifier(reg);
      if (matchingQualifier) {
        processedQualifierIds.add(matchingQualifier.id);
      }
      
      // Track registered emails/IDs per event for dedup in "all events" mode
      registeredEmailEventPairs.add(`${reg.eventId}:${reg.email.toLowerCase()}`);
      if (reg.unicityId) {
        registeredUnicityIdEventPairs.add(`${reg.eventId}:${reg.unicityId}`);
      }
      
      people.push({
        type: "registration",
        id: reg.id,
        firstName: reg.firstName,
        lastName: reg.lastName,
        email: reg.email,
        unicityId: reg.unicityId || null,
        phone: reg.phone,
        eventName: eventNamesById.get(reg.eventId) || "Unknown Event",
        registration: reg,
        qualifier: matchingQualifier,
        isRegistered: true,
      });
    });

    // Add qualifiers that are not yet registered
    if (qualifiers) {
      qualifiers.forEach(q => {
        // Check if this qualifier has a matching registration for the same event
        const emailKey = `${q.eventId}:${q.email.toLowerCase()}`;
        const unicityIdKey = q.unicityId ? `${q.eventId}:${q.unicityId}` : null;
        
        const isRegisteredForThisEvent = 
          registeredEmailEventPairs.has(emailKey) ||
          (unicityIdKey && registeredUnicityIdEventPairs.has(unicityIdKey));
        
        if (!isRegisteredForThisEvent && !processedQualifierIds.has(q.id)) {
          // For qualifiers from "all events" query, they have eventName property
          // For event-specific qualifiers, we look up the name
          const qualifierEventName = (q as any).eventName || eventNamesById.get(q.eventId) || "Unknown Event";
          people.push({
            type: "qualifier",
            id: q.id,
            firstName: q.firstName,
            lastName: q.lastName,
            email: q.email,
            unicityId: q.unicityId || null,
            eventName: qualifierEventName,
            qualifier: { ...q, eventName: qualifierEventName },
            isRegistered: false,
          });
        }
      });
    }

    return people;
  }, [registrations, qualifiers, qualifiersByEmail, eventNamesById]);

  const createQualifierMutation = useMutation({
    mutationFn: async (data: typeof qualifierFormData) => {
      if (eventFilter === "all") throw new Error("Cannot create qualifier without selecting an event");
      const response = await apiRequest("POST", `/api/events/${eventFilter}/qualifiers`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/qualifiers`] });
      setQualifierDialogOpen(false);
      setQualifierFormData({ firstName: "", lastName: "", email: "", unicityId: "", guestAllowanceRuleId: null });
      toast({ title: t("success"), description: "Qualifier added successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to add qualifier", variant: "destructive" });
    },
  });

  const updateQualifierMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof qualifierFormData }) => {
      if (eventFilter === "all") throw new Error("Cannot update qualifier without selecting an event");
      const response = await apiRequest("PATCH", `/api/qualifiers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/qualifiers`] });
      setQualifierDialogOpen(false);
      setEditingQualifier(null);
      setQualifierFormData({ firstName: "", lastName: "", email: "", unicityId: "", guestAllowanceRuleId: null });
      toast({ title: t("success"), description: "Qualifier updated successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update qualifier", variant: "destructive" });
    },
  });

  const deleteQualifierMutation = useMutation({
    mutationFn: async ({ id, eventId }: { id: string; eventId: string }) => {
      await apiRequest("DELETE", `/api/qualifiers/${id}`);
      return { eventId };
    },
    onSuccess: (data) => {
      // Invalidate the specific event's qualifiers cache
      queryClient.invalidateQueries({ queryKey: [`/api/events/${data.eventId}/qualifiers`] });
      // Also invalidate the global qualifiers list if viewing all events
      if (eventFilter === "all") {
        queryClient.invalidateQueries({ queryKey: ["/api/qualifiers"] });
      }
      setQualifierDeleteDialogOpen(false);
      setQualifierToDelete(null);
      toast({ title: t("success"), description: "Qualifier removed successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to remove qualifier", variant: "destructive" });
    },
  });

  const deleteRegistrationMutation = useMutation({
    mutationFn: async ({ id, sendEmail }: { id: string; sendEmail: boolean }) => {
      await apiRequest("DELETE", `/api/registrations/${id}?sendEmail=${sendEmail}`);
    },
    onSuccess: () => {
      // Invalidate all registration-related queries using predicate to match URL-based keys
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = String(query.queryKey[0]);
          return key.startsWith("/api/registrations") || key.includes("/qualifiers");
        }
      });
      // Close the drawer if we deleted the currently selected attendee
      if (selectedAttendee?.id === registrationToDelete?.id) {
        setDrawerOpen(false);
        setSelectedAttendee(null);
      }
      setRegistrationDeleteDialogOpen(false);
      setRegistrationToDelete(null);
      setSendCancellationEmail(true); // Reset to default
      toast({ title: t("success"), description: "Registration deleted successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to delete registration", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async ({ registrationIds, qualifierIds, sendEmail }: { registrationIds: string[]; qualifierIds: string[]; sendEmail: boolean }) => {
      // Delete registrations and qualifiers one by one
      const registrationResults = await Promise.allSettled(
        registrationIds.map(id => apiRequest("DELETE", `/api/registrations/${id}?sendEmail=${sendEmail}`))
      );
      const qualifierResults = await Promise.allSettled(
        qualifierIds.map(id => apiRequest("DELETE", `/api/qualifiers/${id}`))
      );
      const registrationsFailed = registrationResults.filter(r => r.status === "rejected").length;
      const qualifiersFailed = qualifierResults.filter(r => r.status === "rejected").length;
      return { 
        registrations: { total: registrationIds.length, failed: registrationsFailed },
        qualifiers: { total: qualifierIds.length, failed: qualifiersFailed },
        totalDeleted: (registrationIds.length - registrationsFailed) + (qualifierIds.length - qualifiersFailed),
        totalFailed: registrationsFailed + qualifiersFailed,
      };
    },
    onSuccess: (data) => {
      // Invalidate all registration-related queries using the exact query keys
      queryClient.invalidateQueries({ queryKey: ["/api/registrations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/registrations?eventId=${eventFilter}`] });
      if (eventFilter !== "all") {
        queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/qualifiers`] });
      }
      // Also invalidate any query that starts with /api/registrations or /api/qualifiers
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = String(query.queryKey[0]);
          return key.startsWith("/api/registrations") || key.includes("/qualifiers");
        }
      });
      // Clear selection
      setSelectedPeople(new Set());
      setBulkDeleteDialogOpen(false);
      setBulkSendCancellationEmail(true); // Reset to default
      
      const total = data.registrations.total + data.qualifiers.total;
      if (data.totalFailed === 0) {
        toast({ title: t("success"), description: `${data.totalDeleted} attendee(s) deleted successfully` });
      } else {
        toast({ 
          title: "Partially completed", 
          description: `Deleted ${data.totalDeleted} of ${total} attendees. ${data.totalFailed} failed.`, 
          variant: "destructive" 
        });
      }
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to delete attendees", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { registrants: typeof csvData; clearExisting: boolean }) => {
      if (eventFilter === "all") throw new Error("Cannot import qualifiers without selecting an event");
      const response = await apiRequest("POST", `/api/events/${eventFilter}/qualifiers/import`, data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/qualifiers`] });
      setImportDialogOpen(false);
      setCsvData([]);
      setReplaceExisting(false);
      toast({ title: t("success"), description: `Imported ${data.imported} qualifiers` });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to import qualifiers", variant: "destructive" });
    },
  });

  const handleQualifierSubmit = () => {
    if (editingQualifier) {
      updateQualifierMutation.mutate({ id: editingQualifier.id, data: qualifierFormData });
    } else {
      createQualifierMutation.mutate(qualifierFormData);
    }
  };

  const handleEditQualifier = (qualifier: QualifiedRegistrant) => {
    setEditingQualifier(qualifier);
    setQualifierFormData({
      firstName: qualifier.firstName,
      lastName: qualifier.lastName,
      email: qualifier.email,
      unicityId: qualifier.unicityId || "",
      guestAllowanceRuleId: qualifier.guestAllowanceRuleId || null,
    });
    setQualifierDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({ title: t("error"), description: "CSV file must have a header row and at least one data row", variant: "destructive" });
        return;
      }

      const headerRow = lines[0].toLowerCase();
      const headers = headerRow.split(",").map(h => h.trim().replace(/"/g, ""));
      
      const firstNameIdx = headers.findIndex(h => h.includes("first") && h.includes("name"));
      const lastNameIdx = headers.findIndex(h => h.includes("last") && h.includes("name"));
      const emailIdx = headers.findIndex(h => h.includes("email"));
      const unicityIdIdx = headers.findIndex(h => h.includes("unicity") || h.includes("distributor") || h === "id");
      const localeIdx = headers.findIndex(h => h.includes("locale") || h.includes("language") || h.includes("lang"));

      if (emailIdx === -1) {
        toast({ title: t("error"), description: "CSV must contain an email column", variant: "destructive" });
        return;
      }

      const parsedData: typeof csvData = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
        const email = values[emailIdx] || "";
        if (!email || !email.includes("@")) continue;
        
        // Parse locale - default to "en" if not specified or invalid
        let locale = localeIdx >= 0 ? (values[localeIdx] || "").toLowerCase() : "en";
        if (locale !== "en" && locale !== "es") {
          locale = "en";
        }
        
        parsedData.push({
          firstName: values[firstNameIdx] || "",
          lastName: values[lastNameIdx] || "",
          email,
          unicityId: unicityIdIdx >= 0 ? values[unicityIdIdx] || "" : "",
          locale,
        });
      }

      if (parsedData.length === 0) {
        toast({ title: t("error"), description: "No valid records found in CSV", variant: "destructive" });
        return;
      }

      setCsvData(parsedData);
      setImportDialogOpen(true);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExportQualifiers = () => {
    if (eventFilter === "all") return;
    if (!qualifiers?.length) return;

    const csvContent = [
      "First Name,Last Name,Email,Unicity ID,Locale,Status",
      ...qualifiers.map(q => 
        `"${q.firstName}","${q.lastName}","${q.email}","${q.unicityId || ""}","${(q as any).locale || "en"}","${isQualifierRegistered(q) ? "Registered" : "Not Registered"}"`
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qualifiers-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: t("success"), description: "Qualifiers exported successfully" });
  };

  const handleDownloadTemplate = () => {
    const csvContent = [
      "First Name,Last Name,Email,Unicity ID,Locale",
      "John,Doe,john.doe@example.com,12345678,en",
      "Jane,Smith,jane.smith@example.com,87654321,es",
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qualifiers-template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: t("success"), description: "Template downloaded" });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/registrations/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        String(query.queryKey[0]).startsWith("/api/registrations")
      });
      toast({ title: t("success"), description: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update status", variant: "destructive" });
    },
  });

  const updateAttendeeMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!selectedAttendee) throw new Error("No attendee selected");
      const response = await apiRequest("PATCH", `/api/registrations/${selectedAttendee.id}`, data);
      return response.json();
    },
    onSuccess: (updatedData) => {
      queryClient.invalidateQueries({ predicate: (query) => 
        String(query.queryKey[0]).startsWith("/api/registrations")
      });
      if (updatedData && typeof updatedData === 'object') {
        setSelectedAttendee(updatedData as Registration);
      }
      setIsEditing(false);
      toast({ title: t("success"), description: "Attendee updated successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update attendee", variant: "destructive" });
    },
  });

  const moveToEventMutation = useMutation({
    mutationFn: async ({ registrationId, newEventId }: { registrationId: string; newEventId: string }) => {
      const response = await apiRequest("POST", `/api/registrations/${registrationId}/transfer`, { targetEventId: newEventId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        String(query.queryKey[0]).startsWith("/api/registrations")
      });
      setMoveDialogOpen(false);
      setRegistrationToMove(null);
      setTargetEventId("");
      setDrawerOpen(false);
      setSelectedAttendee(null);
      toast({ title: t("success"), description: "Attendee transferred to new event. Check-in status and badges have been reset." });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to move attendee", variant: "destructive" });
    },
  });

  // Resend confirmation email mutation (single)
  const resendConfirmationMutation = useMutation({
    mutationFn: async ({ registrationId, language }: { registrationId: string; language: string }) => {
      const response = await apiRequest("POST", `/api/registrations/${registrationId}/resend-confirmation`, { language });
      return response.json();
    },
    onSuccess: () => {
      setResendDialogOpen(false);
      setResendRegistration(null);
      toast({ title: t("success"), description: "Confirmation email sent successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to send confirmation email", variant: "destructive" });
    },
  });

  // Bulk resend confirmation emails mutation
  const bulkResendConfirmationMutation = useMutation({
    mutationFn: async ({ registrationIds, language }: { registrationIds: string[]; language: string }) => {
      const response = await apiRequest("POST", "/api/registrations/bulk-resend-confirmation", { registrationIds, language });
      return response.json();
    },
    onSuccess: (data) => {
      setBulkResendDialogOpen(false);
      setSelectedPeople(new Set());
      toast({ 
        title: t("success"), 
        description: `Sent ${data.sent} emails${data.failed > 0 ? `, ${data.failed} failed` : ''}` 
      });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to send confirmation emails", variant: "destructive" });
    },
  });

  const handleResendConfirmation = (reg: Registration) => {
    setResendRegistration(reg);
    setResendLanguage(reg.language || "en");
    setResendDialogOpen(true);
  };

  const handleSave = () => {
    if (!selectedAttendee) return;
    
    const existingDietary = selectedAttendee.dietaryRestrictions || [];
    const formDietary = editForm.dietaryRestrictions || [];
    const customRestrictions = existingDietary.filter(d => !DIETARY_OPTIONS.some(opt => opt.value === d));
    const mergedDietary = Array.from(new Set([...formDietary, ...customRestrictions]));
    
    const updateData = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      email: editForm.email,
      phone: editForm.phone || null,
      gender: editForm.gender || null,
      dateOfBirth: editForm.dateOfBirth ? (typeof editForm.dateOfBirth === 'string' ? editForm.dateOfBirth : new Date(editForm.dateOfBirth).toISOString().split('T')[0]) : null,
      passportNumber: editForm.passportNumber || null,
      passportCountry: editForm.passportCountry || null,
      passportExpiration: editForm.passportExpiration ? (typeof editForm.passportExpiration === 'string' ? editForm.passportExpiration : new Date(editForm.passportExpiration).toISOString().split('T')[0]) : null,
      emergencyContact: editForm.emergencyContact || null,
      emergencyContactPhone: editForm.emergencyContactPhone || null,
      shirtSize: editForm.shirtSize || null,
      pantSize: editForm.pantSize || null,
      roomType: editForm.roomType || null,
      dietaryRestrictions: mergedDietary.length > 0 ? mergedDietary : null,
      adaAccommodations: editForm.adaAccommodations || false,
      status: editForm.status,
      notes: editForm.notes || null,
    };
    
    updateAttendeeMutation.mutate(updateData);
  };

  const filteredPeople = useMemo(() => {
    let result = unifiedPeople.filter((person) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        person.firstName.toLowerCase().includes(searchLower) ||
        person.lastName.toLowerCase().includes(searchLower) ||
        person.email.toLowerCase().includes(searchLower) ||
        person.unicityId?.toLowerCase().includes(searchLower) ||
        person.phone?.toLowerCase().includes(searchLower);

      const matchesRegistrationStatus = 
        registrationStatusFilter === "all" ||
        (registrationStatusFilter === "registered" && person.isRegistered) ||
        (registrationStatusFilter === "not_registered" && !person.isRegistered);

      const matchesStatus = 
        statusFilter === "all" || 
        (statusFilter === "qualified" && !person.isRegistered) ||
        (person.registration && person.registration.status === statusFilter);
      
      const matchesEvent = eventFilter === "all" || 
        (person.registration && person.registration.eventId === eventFilter) ||
        person.type === "qualifier";
      
      const matchesSwag = 
        swagFilter === "all" || 
        (person.registration && (person.registration.swagStatus || "pending") === swagFilter);

      return matchesSearch && matchesRegistrationStatus && matchesStatus && matchesEvent && matchesSwag;
    });

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        let aVal: any = "";
        let bVal: any = "";

        switch (sortConfig.key) {
          case "name":
            aVal = `${a.firstName} ${a.lastName}`.toLowerCase();
            bVal = `${b.firstName} ${b.lastName}`.toLowerCase();
            break;
          case "email":
            aVal = a.email.toLowerCase();
            bVal = b.email.toLowerCase();
            break;
          case "phone":
            aVal = a.phone || "";
            bVal = b.phone || "";
            break;
          case "status":
            aVal = a.registration?.status || "";
            bVal = b.registration?.status || "";
            break;
          case "swagStatus":
            aVal = a.registration?.swagStatus || "pending";
            bVal = b.registration?.swagStatus || "pending";
            break;
          case "shirtSize":
            aVal = a.registration?.shirtSize || "";
            bVal = b.registration?.shirtSize || "";
            break;
          case "registeredAt":
            aVal = a.registration?.registeredAt ? new Date(a.registration.registeredAt).getTime() : 0;
            bVal = b.registration?.registeredAt ? new Date(b.registration.registeredAt).getTime() : 0;
            break;
          case "lastModified":
            aVal = a.registration?.lastModified ? new Date(a.registration.lastModified).getTime() : 0;
            bVal = b.registration?.lastModified ? new Date(b.registration.lastModified).getTime() : 0;
            break;
          case "checkedInAt":
            aVal = a.registration?.checkedInAt ? new Date(a.registration.checkedInAt).getTime() : 0;
            bVal = b.registration?.checkedInAt ? new Date(b.registration.checkedInAt).getTime() : 0;
            break;
          case "unicityId":
            aVal = a.unicityId || "";
            bVal = b.unicityId || "";
            break;
          default:
            aVal = (a.registration as any)?.[sortConfig.key] || "";
            bVal = (b.registration as any)?.[sortConfig.key] || "";
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [unifiedPeople, searchQuery, statusFilter, registrationStatusFilter, eventFilter, swagFilter, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === "asc") return { key, direction: "desc" };
        return null;
      }
      return { key, direction: "asc" };
    });
  };

  const handleExportCSV = () => {
    if (!filteredPeople?.length) return;

    const exportColumns = ALL_COLUMNS.filter(c => effectiveVisibleColumns.has(c.key) && c.key !== "actions");
    const headers = exportColumns.map(c => c.label);
    
    const csvContent = [
      headers.join(","),
      ...filteredPeople.map((person) => {
        const reg = person.registration;
        return exportColumns.map(col => {
          let value = "";
          switch (col.key) {
            case "name":
              value = `${person.firstName} ${person.lastName}`;
              break;
            case "unicityId":
              value = person.unicityId || "";
              break;
            case "email":
              value = person.email;
              break;
            case "phone":
              value = person.phone || "";
              break;
            case "gender":
              value = reg?.gender || "";
              break;
            case "dateOfBirth":
              value = reg?.dateOfBirth ? formatDateOnly(reg.dateOfBirth, "yyyy-MM-dd") : "";
              break;
            case "status":
              value = reg?.status || "Not Registered";
              break;
            case "swagStatus":
              value = reg?.swagStatus || "pending";
              break;
            case "shirtSize":
              value = reg?.shirtSize || "";
              break;
            case "pantSize":
              value = reg?.pantSize || "";
              break;
            case "roomType":
              value = reg?.roomType || "";
              break;
            case "passportNumber":
              value = reg?.passportNumber || "";
              break;
            case "passportCountry":
              value = reg?.passportCountry || "";
              break;
            case "passportExpiration":
              value = reg?.passportExpiration ? formatDateOnly(reg.passportExpiration, "yyyy-MM-dd") : "";
              break;
            case "emergencyContact":
              value = reg?.emergencyContact || "";
              break;
            case "emergencyContactPhone":
              value = reg?.emergencyContactPhone || "";
              break;
            case "dietaryRestrictions":
              value = reg?.dietaryRestrictions?.join("; ") || "";
              break;
            case "dietaryPreference":
              value = (reg?.formData as any)?.dietaryPreference || "";
              break;
            case "dietaryNotes":
              value = (reg?.formData as any)?.dietaryNotes || "";
              break;
            case "adaAccommodations":
              value = reg?.adaAccommodations ? "Yes" : "No";
              break;
            case "registeredAt":
              value = reg?.registeredAt ? format(new Date(reg.registeredAt), "yyyy-MM-dd HH:mm") : "";
              break;
            case "checkedInAt":
              value = reg?.checkedInAt ? format(new Date(reg.checkedInAt), "yyyy-MM-dd HH:mm") : "";
              break;
            case "lastModified":
              value = reg?.lastModified ? format(new Date(reg.lastModified), "yyyy-MM-dd HH:mm") : "";
              break;
            case "verifiedByHydra":
              value = reg ? (reg.verifiedByHydra ? "Hydra" : "Qualified List") : "";
              break;
            case "event":
              value = person.eventName || "";
              break;
          }
          return `"${value.toString().replace(/"/g, '""')}"`;
        }).join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendees-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({ title: t("success"), description: "CSV exported successfully" });
  };

  const handleExportSelectedCSV = () => {
    if (selectedPeople.size === 0) return;

    const selectedList = filteredPeople.filter(p => selectedPeople.has(p.id));
    const exportColumns = ALL_COLUMNS.filter(c => effectiveVisibleColumns.has(c.key) && c.key !== "actions");
    const headers = exportColumns.map(c => c.label);
    
    const csvContent = [
      headers.join(","),
      ...selectedList.map((person) => {
        const reg = person.registration;
        return exportColumns.map(col => {
          let value = "";
          switch (col.key) {
            case "name":
              value = `${person.firstName} ${person.lastName}`;
              break;
            case "unicityId":
              value = person.unicityId || "";
              break;
            case "email":
              value = person.email;
              break;
            case "phone":
              value = person.phone || "";
              break;
            case "gender":
              value = reg?.gender || "";
              break;
            case "dateOfBirth":
              value = reg?.dateOfBirth ? formatDateOnly(reg.dateOfBirth, "yyyy-MM-dd") : "";
              break;
            case "status":
              value = reg?.status || "Not Registered";
              break;
            case "swagStatus":
              value = reg?.swagStatus || "pending";
              break;
            case "shirtSize":
              value = reg?.shirtSize || "";
              break;
            case "pantSize":
              value = reg?.pantSize || "";
              break;
            case "roomType":
              value = reg?.roomType || "";
              break;
            case "passportNumber":
              value = reg?.passportNumber || "";
              break;
            case "passportCountry":
              value = reg?.passportCountry || "";
              break;
            case "passportExpiration":
              value = reg?.passportExpiration ? formatDateOnly(reg.passportExpiration, "yyyy-MM-dd") : "";
              break;
            case "emergencyContact":
              value = reg?.emergencyContact || "";
              break;
            case "emergencyContactPhone":
              value = reg?.emergencyContactPhone || "";
              break;
            case "dietaryRestrictions":
              value = reg?.dietaryRestrictions?.join("; ") || "";
              break;
            case "dietaryPreference":
              value = (reg?.formData as any)?.dietaryPreference || "";
              break;
            case "dietaryNotes":
              value = (reg?.formData as any)?.dietaryNotes || "";
              break;
            case "adaAccommodations":
              value = reg?.adaAccommodations ? "Yes" : "No";
              break;
            case "registeredAt":
              value = reg?.registeredAt ? format(new Date(reg.registeredAt), "yyyy-MM-dd HH:mm") : "";
              break;
            case "checkedInAt":
              value = reg?.checkedInAt ? format(new Date(reg.checkedInAt), "yyyy-MM-dd HH:mm") : "";
              break;
            case "lastModified":
              value = reg?.lastModified ? format(new Date(reg.lastModified), "yyyy-MM-dd HH:mm") : "";
              break;
            case "verifiedByHydra":
              value = reg ? (reg.verifiedByHydra ? "Hydra" : "Qualified List") : "";
              break;
            case "event":
              value = person.eventName || "";
              break;
          }
          return `"${value.toString().replace(/"/g, '""')}"`;
        }).join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendees-selected-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({ title: t("success"), description: `Exported ${selectedList.length} selected attendees` });
  };

  const toggleSelectPerson = (id: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPeople.size === filteredPeople.length) {
      setSelectedPeople(new Set());
    } else {
      setSelectedPeople(new Set(filteredPeople.map(p => p.id)));
    }
  };

  const isAllSelected = filteredPeople.length > 0 && selectedPeople.size === filteredPeople.length;
  const isSomeSelected = selectedPeople.size > 0 && selectedPeople.size < filteredPeople.length;

  const SortableHeader = ({ columnKey, children }: { columnKey: string; children: React.ReactNode }) => {
    const isActive = sortConfig?.key === columnKey;
    return (
      <button
        onClick={() => handleSort(columnKey)}
        className="flex items-center gap-1 hover:text-foreground transition-colors text-left"
        data-testid={`sort-${columnKey}`}
      >
        {children}
        {isActive ? (
          sortConfig.direction === "asc" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    );
  };

  const renderCell = (person: UnifiedPerson, key: ColumnKey) => {
    const reg = person.registration;
    switch (key) {
      case "name":
        const assignedRule = person.qualifier?.guestAllowanceRuleId 
          ? guestRulesById.get(person.qualifier.guestAllowanceRuleId)
          : undefined;
        return (
          <div className="min-w-[150px]">
            <div className="flex items-center gap-2">
              <span className="font-medium whitespace-nowrap" data-testid={`text-name-${person.id}`}>{person.firstName} {person.lastName}</span>
              {person.isRegistered && person.qualifier && eventFilter !== "all" && (
                <Badge variant="outline" className="text-xs" data-testid={`badge-qualified-${person.id}`}>Qualified</Badge>
              )}
              {selectedEvent?.guestPolicy === "allowed_mixed" && person.qualifier && assignedRule && (
                <Badge variant="outline" className="text-xs" data-testid={`badge-rule-${person.id}`}>
                  {assignedRule.name}
                </Badge>
              )}
            </div>
          </div>
        );
      case "unicityId":
        return <span className="text-muted-foreground whitespace-nowrap">{person.unicityId || "-"}</span>;
      case "email":
        return <span className="text-muted-foreground whitespace-nowrap">{person.email}</span>;
      case "phone":
        return <span className="text-muted-foreground whitespace-nowrap">{person.phone || "-"}</span>;
      case "gender":
        return <span className="text-muted-foreground capitalize whitespace-nowrap">{reg?.gender || "-"}</span>;
      case "dateOfBirth":
        return <span className="text-muted-foreground whitespace-nowrap">{formatDateOnly(reg?.dateOfBirth)}</span>;
      case "status":
        return person.isRegistered && reg ? (
          <StatusBadge status={reg.status} />
        ) : (
          selectedEvent?.registrationMode === "qualified_verified" ? (
            <Badge variant="outline" className="text-xs" data-testid={`status-pending-${person.id}`}>
              Qualified – Awaiting Registration
            </Badge>
          ) : (
            <span className="text-muted-foreground">Not Registered</span>
          )
        );
      case "swagStatus":
        return reg ? <StatusBadge status={reg.swagStatus || "pending"} type="swag" /> : <span className="text-muted-foreground">-</span>;
      case "shirtSize":
        return <span className="text-muted-foreground whitespace-nowrap">{reg?.shirtSize || "-"}</span>;
      case "pantSize":
        return <span className="text-muted-foreground whitespace-nowrap">{reg?.pantSize || "-"}</span>;
      case "roomType":
        return <span className="text-muted-foreground capitalize whitespace-nowrap">{reg?.roomType || "-"}</span>;
      case "passportNumber":
        return <span className="text-muted-foreground whitespace-nowrap">{reg?.passportNumber || "-"}</span>;
      case "passportCountry":
        return <span className="text-muted-foreground whitespace-nowrap">{reg?.passportCountry || "-"}</span>;
      case "passportExpiration":
        return <span className="text-muted-foreground whitespace-nowrap">{formatDateOnly(reg?.passportExpiration)}</span>;
      case "emergencyContact":
        return <span className="text-muted-foreground whitespace-nowrap">{reg?.emergencyContact || "-"}</span>;
      case "emergencyContactPhone":
        return <span className="text-muted-foreground whitespace-nowrap">{reg?.emergencyContactPhone || "-"}</span>;
      case "dietaryRestrictions":
        return <span className="text-muted-foreground whitespace-nowrap">{reg?.dietaryRestrictions?.join(", ") || "-"}</span>;
      case "dietaryPreference": {
        const preference = (reg?.formData as any)?.dietaryPreference;
        const labels: Record<string, string> = { none: "No restrictions", vegetarian: "Vegetarian", vegan: "Vegan", other: "Other / Allergies" };
        return <span className="text-muted-foreground whitespace-nowrap">{preference ? (labels[preference] || preference) : "-"}</span>;
      }
      case "dietaryNotes":
        return <span className="text-muted-foreground whitespace-nowrap">{(reg?.formData as any)?.dietaryNotes || "-"}</span>;
      case "adaAccommodations":
        return <span className="text-muted-foreground whitespace-nowrap">{reg?.adaAccommodations ? "Yes" : "No"}</span>;
      case "language":
        if (!reg) return <span className="text-muted-foreground">-</span>;
        return reg.language === "es" 
          ? <Badge variant="outline" className="text-xs">ES</Badge>
          : <Badge variant="outline" className="text-xs">EN</Badge>;
      case "registeredAt":
        return <span className="text-muted-foreground text-sm whitespace-nowrap">{reg?.registeredAt ? format(new Date(reg.registeredAt), "MMM d, yyyy") : "-"}</span>;
      case "checkedInAt":
        return <span className="text-muted-foreground text-sm whitespace-nowrap">{reg?.checkedInAt ? format(new Date(reg.checkedInAt), "MMM d, h:mm a") : "-"}</span>;
      case "lastModified":
        return <span className="text-muted-foreground text-sm whitespace-nowrap">{reg?.lastModified ? format(new Date(reg.lastModified), "MMM d, h:mm a") : "-"}</span>;
      case "verifiedByHydra":
        if (!reg) return <span className="text-muted-foreground">-</span>;
        return reg.verifiedByHydra 
          ? <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Hydra</Badge>
          : <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Qualified List</Badge>;
      case "event":
        return <span className="text-muted-foreground whitespace-nowrap">{person.eventName || "-"}</span>;
      case "actions":
        if (person.isRegistered && reg) {
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid={`button-actions-${person.id}`} onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild data-testid={`action-view-profile-${person.id}`}>
                  <Link 
                    href={`/admin/profile?email=${encodeURIComponent(reg.email)}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <User className="h-4 w-4 mr-2" />
                    View Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setSelectedAttendee(reg);
                    setEditForm(reg);
                    setIsEditing(true);
                    setDrawerOpen(true);
                  }}
                  data-testid={`action-edit-${person.id}`}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  {t("edit")}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    handleResendConfirmation(reg);
                  }}
                  data-testid={`action-email-${person.id}`}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Resend Confirmation
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: reg.id, status: "registered" }); }}
                  data-testid={`action-mark-registered-${person.id}`}
                >
                  Mark as Registered
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: reg.id, status: "checked_in" }); }}
                  data-testid={`action-mark-checked-in-${person.id}`}
                >
                  Mark as Checked In
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: reg.id, status: "not_coming" }); }}
                  data-testid={`action-mark-not-coming-${person.id}`}
                >
                  Mark as Not Coming
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setRegistrationToMove(reg);
                    setTargetEventId("");
                    setMoveDialogOpen(true);
                  }}
                  data-testid={`action-move-${person.id}`}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Move to Event
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-destructive" 
                  data-testid={`action-delete-${person.id}`}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setRegistrationToDelete(reg);
                    setRegistrationDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        } else if (person.qualifier) {
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); handleEditQualifier(person.qualifier!); }}
                data-testid={`action-edit-qualifier-${person.id}`}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); setQualifierToDelete(person.qualifier!); setQualifierDeleteDialogOpen(true); }}
                className="text-destructive"
                data-testid={`action-delete-qualifier-${person.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        }
        return "-";
      default:
        return "-";
    }
  };

  // For "All Events" mode, force visibility to only SHARED_COLUMNS (no customization allowed)
  // For specific event views, use persisted visibleColumns intersected with relevantColumns
  const effectiveVisibleColumns = useMemo(() => {
    if (eventFilter === "all") {
      return new Set(SHARED_COLUMNS);
    }
    // For specific event: intersection of user's visible preferences and what's relevant for the event
    return new Set(Array.from(visibleColumns).filter(c => relevantColumns.has(c)));
  }, [eventFilter, visibleColumns, relevantColumns]);
  
  // Build visible column list respecting user's column order
  const visibleColumnList = useMemo(() => {
    const columnMap = new Map(ALL_COLUMNS.map(c => [c.key, c]));
    // Use columnOrder for ordering, filter by visibility
    return columnOrder
      .filter(key => effectiveVisibleColumns.has(key) && columnMap.has(key))
      .map(key => columnMap.get(key)!);
  }, [columnOrder, effectiveVisibleColumns]);

  // Get orderable columns for the popover (respects current order, filters by relevance)
  const orderableColumns = useMemo(() => {
    const columnMap = new Map(ALL_COLUMNS.map(c => [c.key, c]));
    return columnOrder
      .filter(key => key !== "actions" && relevantColumns.has(key) && columnMap.has(key))
      .map(key => columnMap.get(key)!);
  }, [columnOrder, relevantColumns]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("attendees")}</h1>
          <p className="text-muted-foreground">
            {filteredPeople?.length ?? 0} people
            {eventFilter !== "all" && qualifiers && ` (${registrations?.length ?? 0} registered, ${qualifiers.filter(q => !isQualifierRegistered(q)).length} pending)`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {eventFilter !== "all" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                data-testid="input-csv-upload"
              />
              <Button 
                variant="outline" 
                onClick={handleDownloadTemplate}
                data-testid="button-download-template"
              >
                <Download className="h-4 w-4 mr-2" />
                Template
              </Button>
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-csv"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExportQualifiers}
                disabled={!qualifiers?.length}
                data-testid="button-export-qualifiers"
              >
                <Download className="h-4 w-4 mr-2" />
                Export List
              </Button>
              <Button 
                onClick={() => {
                  setEditingQualifier(null);
                  setQualifierFormData({ firstName: "", lastName: "", email: "", unicityId: "", guestAllowanceRuleId: null });
                  setQualifierDialogOpen(true);
                }}
                data-testid="button-add-qualifier"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Person
              </Button>
            </>
          )}
          {eventFilter !== "all" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" data-testid="button-column-settings">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Visible Columns</h4>
                  <p className="text-xs text-muted-foreground">Drag to reorder, check to show/hide</p>
                  <Separator />
                  <ScrollArea className="h-[300px] pr-3">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={orderableColumns.map(c => c.key)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-1">
                          {orderableColumns.map((col) => (
                            <SortableColumnItem
                              key={col.key}
                              id={col.key}
                              label={col.label}
                              isVisible={visibleColumns.has(col.key)}
                              onToggle={() => toggleColumn(col.key)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-export-csv">
                <Download className="h-4 w-4 mr-2" />
                {t("export")}
                {selectedPeople.size > 0 && (
                  <Badge variant="secondary" className="ml-2">{selectedPeople.size}</Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCSV} data-testid="button-export-all">
                Export All ({filteredPeople.length})
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleExportSelectedCSV} 
                disabled={selectedPeople.size === 0}
                data-testid="button-export-selected"
              >
                Export Selected ({selectedPeople.size})
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedPeople.size > 0 && (
            <>
              <Button 
                variant="outline" 
                onClick={() => setBulkResendDialogOpen(true)}
                data-testid="button-bulk-resend"
              >
                <Send className="h-4 w-4 mr-2" />
                Resend Confirmation ({selectedPeople.size})
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => setBulkDeleteDialogOpen(true)}
                data-testid="button-delete-selected"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedPeople.size})
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-attendees"
          />
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-event-filter">
            <SelectValue placeholder="All Events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            {events?.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedEvent && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.open(`/register/${selectedEvent.slug}`, '_blank')}
            title="Open registration page"
            data-testid="button-open-registration"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        {eventFilter !== "all" && (
          <Select value={registrationStatusFilter} onValueChange={setRegistrationStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-registration-status-filter">
              <SelectValue placeholder="All People" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All People</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="not_registered">Awaiting Registration</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="qualified">{t("qualified")}</SelectItem>
            <SelectItem value="pending">Awaiting Registration</SelectItem>
            <SelectItem value="registered">{t("registered")}</SelectItem>
            <SelectItem value="checked_in">{t("checkedIn")}</SelectItem>
            <SelectItem value="not_coming">{t("notComing")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={swagFilter} onValueChange={setSwagFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-swag-filter">
            <SelectValue placeholder="All Swag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Swag</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="received">Received</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 w-10 sticky left-0 z-20 bg-muted/50 after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-border">
                  <Checkbox 
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                    data-testid="checkbox-select-all"
                    className={isSomeSelected ? "data-[state=checked]:bg-primary/50" : ""}
                  />
                </th>
                {visibleColumnList.map((col) => (
                  <th 
                    key={col.key} 
                    className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {col.key !== "actions" ? (
                      <div className="flex items-center gap-1">
                        <SortableHeader columnKey={col.key}>{col.label}</SortableHeader>
                        {col.key === "verifiedByHydra" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-sm">
                              <p className="font-medium mb-1">Verification Methods:</p>
                              <p><span className="text-green-600 font-medium">Hydra</span> - Self-verified through Unicity's official verification system</p>
                              <p className="mt-1"><span className="text-yellow-600 font-medium">Qualified List</span> - Pre-approved by an admin (CSV upload or manually added)</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    ) : (
                      ""
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3 w-10">
                      <div className="h-4 w-4 bg-muted rounded" />
                    </td>
                    {visibleColumnList.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredPeople.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnList.length + 1} className="px-4 py-12 text-center text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No people found</p>
                  </td>
                </tr>
              ) : (
                filteredPeople.map((person) => (
                  <tr
                    key={person.id}
                    className={`hover:bg-muted/50 transition-colors ${person.registration ? 'cursor-pointer' : ''}`}
                    data-testid={`row-attendee-${person.id}`}
                    onClick={() => handleRowClick(person)}
                  >
                    <td className="px-4 py-3 w-10 sticky left-0 z-10 bg-background after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-border" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedPeople.has(person.id)}
                        onCheckedChange={() => toggleSelectPerson(person.id)}
                        aria-label={`Select ${person.firstName} ${person.lastName}`}
                        data-testid={`checkbox-select-${person.id}`}
                      />
                    </td>
                    {visibleColumnList.map((col) => (
                      <td 
                        key={col.key} 
                        className="px-4 py-3"
                      >
                        {renderCell(person, col.key)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={(open) => {
        setDrawerOpen(open);
        if (!open) setIsEditing(false);
      }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between gap-4">
              <SheetTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {selectedAttendee?.firstName} {selectedAttendee?.lastName}
              </SheetTitle>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={handleEditToggle} data-testid="button-edit-attendee">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </div>
            <SheetDescription>
              {selectedAttendee?.unicityId && `Distributor ID: ${selectedAttendee.unicityId}`}
            </SheetDescription>
          </SheetHeader>
          
          {selectedAttendee && !isEditing && (
            <div className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <StatusBadge status={selectedAttendee.status} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Swag</p>
                  <StatusBadge status={selectedAttendee.swagStatus || "pending"} type="swag" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Locale</p>
                  <Badge variant="outline" className="text-xs">
                    {selectedAttendee.language === "es" ? "ES" : "EN"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Registered</p>
                  <span className="text-sm font-medium">
                    {selectedAttendee.registeredAt 
                      ? format(new Date(selectedAttendee.registeredAt), "MMM d, yyyy") 
                      : "-"}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Modified</p>
                  <span className="text-sm font-medium">
                    {selectedAttendee.lastModified 
                      ? format(new Date(selectedAttendee.lastModified), "MMM d, yyyy h:mm a") 
                      : "-"}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-medium">Contact Information</h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Email</span>
                    <div className="flex items-center gap-1">
                      <span>{selectedAttendee.email}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedAttendee.email);
                          toast({
                            title: "Copied",
                            description: "Email copied to clipboard",
                          });
                        }}
                        data-testid="button-copy-email"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{selectedAttendee.phone || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gender</span>
                    <span className="capitalize">{selectedAttendee.gender || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date of Birth</span>
                    <span>{formatDateOnly(selectedAttendee.dateOfBirth)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Dynamic Form Template Fields - uses eventFormFields which supports both templates and custom formFields */}
              {(() => {
                // eventFormFields already handles both template fields and custom formFields
                // Filter out contact info fields (already shown above) 
                const displayFields = eventFormFields
                  ? (eventFormFields as Array<{
                      name: string;
                      label?: string;
                      type?: string;
                      options?: Array<{ value: string; label: string }>;
                    }>).filter(f => !CONTACT_INFO_FIELDS.has(f.name))
                  : null;
                
                if (displayFields && displayFields.length > 0) {
                  return (
                    <div className="space-y-3">
                      <h4 className="font-medium">Registration Details</h4>
                      <div className="grid gap-2 text-sm">
                        {displayFields.map((field) => {
                          const value = getFieldValue(selectedAttendee, field.name);
                          const displayValue = formatFieldValue(value, field.type, field.options);
                          const displayLabel = field.label || field.name;
                          
                          // For checkbox fields, show shortened label with tooltip for full text
                          // Also show IP and timestamp from acknowledgmentDetails
                          if (field.type === "checkbox") {
                            const needsTruncation = displayLabel.length > 60;
                            const ackDetails = (selectedAttendee as Record<string, unknown>).acknowledgmentDetails as Record<string, { ip: string; timestamp: string }> | null;
                            const fieldAck = ackDetails?.[field.name];
                            
                            return (
                              <Tooltip key={field.name}>
                                <TooltipTrigger asChild>
                                  <div className="flex justify-between gap-4 cursor-default">
                                    <span className="text-muted-foreground">
                                      {needsTruncation ? `${displayLabel.slice(0, 60)}...` : displayLabel}
                                    </span>
                                    <div className="text-right shrink-0">
                                      <span>{value === true ? "Yes" : value === false ? "No" : "-"}</span>
                                      {fieldAck && (
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          {format(new Date(fieldAck.timestamp), "MMM d, yyyy h:mm a")}
                                          <span className="ml-1">({fieldAck.ip})</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                {needsTruncation && (
                                  <TooltipContent side="left" className="max-w-sm">
                                    <p className="text-sm">{displayLabel}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            );
                          }
                          
                          return (
                            <div key={field.name} className="flex justify-between gap-4">
                              <span className="text-muted-foreground">{displayLabel}</span>
                              <span className="text-right">{displayValue}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                
                // Fallback to legacy hardcoded fields for events without templates
                return (
                  <>
                    <div className="space-y-3">
                      <h4 className="font-medium">Passport Information</h4>
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Passport Number</span>
                          <span>{selectedAttendee.passportNumber || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Country</span>
                          <span>{selectedAttendee.passportCountry || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expiration</span>
                          <span>{formatDateOnly(selectedAttendee.passportExpiration)}</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <h4 className="font-medium">Emergency Contact</h4>
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Name</span>
                          <span>{selectedAttendee.emergencyContact || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Phone</span>
                          <span>{selectedAttendee.emergencyContactPhone || "-"}</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <h4 className="font-medium">Apparel & Preferences</h4>
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Shirt Size</span>
                          <span>{selectedAttendee.shirtSize || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pant Size</span>
                          <span>{selectedAttendee.pantSize || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Room Type</span>
                          <span>{selectedAttendee.roomType || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Dietary Restrictions</span>
                          <span>
                            {selectedAttendee.dietaryRestrictions?.length 
                              ? selectedAttendee.dietaryRestrictions.join(", ") 
                              : "None"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ADA Accommodations</span>
                          <div className="text-right">
                            <span>{selectedAttendee.adaAccommodations ? "Yes" : "No"}</span>
                            {selectedAttendee.adaAccommodations && (selectedAttendee as any).adaAccommodationsAt && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {format(new Date((selectedAttendee as any).adaAccommodationsAt), "MMM d, yyyy h:mm a")}
                                {(selectedAttendee as any).adaAccommodationsIp && (
                                  <span className="ml-1">({(selectedAttendee as any).adaAccommodationsIp})</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              <Separator />

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Shirt className="h-4 w-4" />
                  Swag Assignments
                </h4>
                {swagLoading ? (
                  <p className="text-sm text-muted-foreground">Loading swag assignments...</p>
                ) : swagError ? (
                  <p className="text-sm text-destructive">Error loading swag assignments</p>
                ) : swagAssignments && swagAssignments.length > 0 ? (
                  <div className="space-y-2">
                    {swagAssignments.map((assignment) => (
                      <div 
                        key={assignment.id} 
                        className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50"
                        data-testid={`swag-assignment-${assignment.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{assignment.swagItem?.name}</span>
                          {assignment.size && (
                            <span className="text-muted-foreground">({assignment.size})</span>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          assignment.status === 'received' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {assignment.status === 'received' ? 'Received' : 'Assigned'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No swag assigned yet</p>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <PrinterIcon className="h-4 w-4" />
                  Badge Print History
                </h4>
                {printLogsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading print history...</p>
                ) : printLogs && printLogs.length > 0 ? (
                  <div className="space-y-2">
                    {printLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50"
                        data-testid={`print-log-${log.id}`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            {log.status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                            {log.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-600" />}
                            {log.status === 'pending' && <Clock className="h-3.5 w-3.5 text-yellow-600" />}
                            {log.status === 'sent' && <Send className="h-3.5 w-3.5 text-blue-600" />}
                            <span className="font-medium capitalize">{log.status}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.requestedAt), "MMM d, yyyy h:mm a")}
                          </span>
                          {log.errorMessage && (
                            <span className="text-xs text-destructive">{log.errorMessage}</span>
                          )}
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          {log.retryCount && log.retryCount > 0 && (
                            <div>Retries: {log.retryCount}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No badge prints yet</p>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <PrinterIcon className="h-4 w-4" />
                  Print Badge
                </h4>
                <div className="flex gap-2">
                  <Select
                    value={selectedPrinterId}
                    onValueChange={setSelectedPrinterId}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-printer">
                      <SelectValue placeholder="Select printer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {eventPrinters && eventPrinters.length > 0 ? (
                        eventPrinters.map((printer) => (
                          <SelectItem key={printer.id} value={printer.id}>
                            {printer.name} {printer.status === "online" ? "(Online)" : printer.status === "offline" ? "(Offline)" : ""}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No printers configured</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => {
                      if (selectedAttendee && selectedPrinterId) {
                        printBadgeMutation.mutate({
                          registrationId: selectedAttendee.id,
                          printerId: selectedPrinterId,
                        });
                      }
                    }}
                    disabled={!selectedPrinterId || printBadgeMutation.isPending}
                    data-testid="button-print-badge"
                  >
                    {printBadgeMutation.isPending ? "Printing..." : "Print Badge"}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Select 
                  value={selectedAttendee.status} 
                  onValueChange={(status) => {
                    updateStatusMutation.mutate({ id: selectedAttendee.id, status });
                    setSelectedAttendee({ ...selectedAttendee, status });
                  }}
                >
                  <SelectTrigger className="flex-1" data-testid="select-status-drawer">
                    <SelectValue placeholder="Change Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="checked_in">Checked In</SelectItem>
                    <SelectItem value="not_coming">Not Coming</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setDrawerOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {selectedAttendee && isEditing && (
            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status || ""} onValueChange={(v) => handleFormChange("status", v)}>
                  <SelectTrigger data-testid="edit-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="checked_in">Checked In</SelectItem>
                    <SelectItem value="not_coming">Not Coming</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Locale</Label>
                <Select value={editForm.language || "en"} onValueChange={(v) => handleFormChange("language", v)}>
                  <SelectTrigger data-testid="edit-language">
                    <SelectValue placeholder="Select locale" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English (EN)</SelectItem>
                    <SelectItem value="es">Spanish (ES)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Personal Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input 
                      value={editForm.firstName || ""} 
                      onChange={(e) => handleFormChange("firstName", e.target.value)}
                      data-testid="edit-firstName"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input 
                      value={editForm.lastName || ""} 
                      onChange={(e) => handleFormChange("lastName", e.target.value)}
                      data-testid="edit-lastName"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    type="email"
                    value={editForm.email || ""} 
                    onChange={(e) => handleFormChange("email", e.target.value)}
                    data-testid="edit-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <PhoneInput
                    international
                    defaultCountry="US"
                    value={editForm.phone || ""}
                    onChange={(value) => handleFormChange("phone", value || "")}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-within:ring-1 focus-within:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    data-testid="edit-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={editForm.gender || ""} onValueChange={(v) => handleFormChange("gender", v)}>
                    <SelectTrigger data-testid="edit-gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input 
                    type="date"
                    value={editForm.dateOfBirth ? formatDateOnly(editForm.dateOfBirth, "yyyy-MM-dd") : ""} 
                    onChange={(e) => handleFormChange("dateOfBirth", e.target.value)}
                    data-testid="edit-dateOfBirth"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Passport Information</h4>
                <div className="space-y-2">
                  <Label>Passport Number</Label>
                  <Input 
                    value={editForm.passportNumber || ""} 
                    onChange={(e) => handleFormChange("passportNumber", e.target.value)}
                    data-testid="edit-passportNumber"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Passport Country</Label>
                  <Input 
                    value={editForm.passportCountry || ""} 
                    onChange={(e) => handleFormChange("passportCountry", e.target.value)}
                    data-testid="edit-passportCountry"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Passport Expiration</Label>
                  <Input 
                    type="date"
                    value={editForm.passportExpiration ? formatDateOnly(editForm.passportExpiration, "yyyy-MM-dd") : ""} 
                    onChange={(e) => handleFormChange("passportExpiration", e.target.value)}
                    data-testid="edit-passportExpiration"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Emergency Contact</h4>
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input 
                    value={editForm.emergencyContact || ""} 
                    onChange={(e) => handleFormChange("emergencyContact", e.target.value)}
                    data-testid="edit-emergencyContact"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <PhoneInput
                    international
                    defaultCountry="US"
                    value={editForm.emergencyContactPhone || ""}
                    onChange={(value) => handleFormChange("emergencyContactPhone", value || "")}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-within:ring-1 focus-within:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    data-testid="edit-emergencyContactPhone"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Apparel & Preferences</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Shirt Size</Label>
                    <Select value={editForm.shirtSize || ""} onValueChange={(v) => handleFormChange("shirtSize", v)}>
                      <SelectTrigger data-testid="edit-shirtSize">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="XS">XS</SelectItem>
                        <SelectItem value="S">S</SelectItem>
                        <SelectItem value="M">M</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="XL">XL</SelectItem>
                        <SelectItem value="2XL">2XL</SelectItem>
                        <SelectItem value="3XL">3XL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pant Size</Label>
                    <Input 
                      value={editForm.pantSize || ""} 
                      onChange={(e) => handleFormChange("pantSize", e.target.value)}
                      data-testid="edit-pantSize"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Room Type</Label>
                  <Select value={editForm.roomType || ""} onValueChange={(v) => handleFormChange("roomType", v)}>
                    <SelectTrigger data-testid="edit-roomType">
                      <SelectValue placeholder="Select room type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="double">Double</SelectItem>
                      <SelectItem value="suite">Suite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Dietary Restrictions</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {DIETARY_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-diet-${option.value}`}
                          checked={editForm.dietaryRestrictions?.includes(option.value) || false}
                          onCheckedChange={(checked) => handleDietaryChange(option.value, !!checked)}
                          data-testid={`edit-diet-${option.value}`}
                        />
                        <Label htmlFor={`edit-diet-${option.value}`} className="text-sm font-normal">
                          {option.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-ada"
                    checked={editForm.adaAccommodations || false}
                    onCheckedChange={(checked) => handleFormChange("adaAccommodations", !!checked)}
                    data-testid="edit-adaAccommodations"
                  />
                  <Label htmlFor="edit-ada" className="text-sm font-normal">
                    ADA Accommodations Required
                  </Label>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Admin Notes</h4>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editForm.notes || ""}
                    onChange={(e) => handleFormChange("notes", e.target.value)}
                    placeholder="Add notes about this attendee..."
                    className="min-h-[100px]"
                    data-testid="edit-notes"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4 sticky bottom-0 bg-background py-4 border-t">
                <Button 
                  onClick={handleSave} 
                  disabled={updateAttendeeMutation.isPending}
                  className="flex-1"
                  data-testid="button-save-attendee"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateAttendeeMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add/Edit Qualifier Dialog */}
      <Dialog open={qualifierDialogOpen} onOpenChange={setQualifierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingQualifier ? "Edit Person" : "Add Person"}</DialogTitle>
            <DialogDescription>
              {editingQualifier 
                ? "Update this person's information" 
                : "Add a new person to the qualified registrants list"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="qualifier-firstName">First Name *</Label>
                <Input
                  id="qualifier-firstName"
                  value={qualifierFormData.firstName}
                  onChange={(e) => setQualifierFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="First name"
                  data-testid="input-qualifier-first-name"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="qualifier-lastName">Last Name *</Label>
                <Input
                  id="qualifier-lastName"
                  value={qualifierFormData.lastName}
                  onChange={(e) => setQualifierFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Last name"
                  data-testid="input-qualifier-last-name"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="qualifier-email">Email *</Label>
              <Input
                id="qualifier-email"
                type="email"
                value={qualifierFormData.email}
                onChange={(e) => setQualifierFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
                data-testid="input-qualifier-email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="qualifier-unicityId">Unicity ID (optional)</Label>
              <Input
                id="qualifier-unicityId"
                value={qualifierFormData.unicityId}
                onChange={(e) => setQualifierFormData(prev => ({ ...prev, unicityId: e.target.value }))}
                placeholder="Distributor ID"
                data-testid="input-qualifier-unicity-id"
              />
            </div>
            {selectedEvent?.guestPolicy === "allowed_mixed" && guestRules.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="qualifier-guestRule">Guest Allowance Rule</Label>
                <Select
                  value={qualifierFormData.guestAllowanceRuleId || "default"}
                  onValueChange={(value) => setQualifierFormData(prev => ({ 
                    ...prev, 
                    guestAllowanceRuleId: value === "default" ? null : value 
                  }))}
                >
                  <SelectTrigger data-testid="select-qualifier-guest-rule">
                    <SelectValue placeholder="Select a rule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use Default Rule</SelectItem>
                    {guestRules.map((rule) => (
                      <SelectItem key={rule.id} value={rule.id}>
                        {rule.name} ({rule.freeGuestCount ?? 0} free{(rule.maxPaidGuests ?? 0) > 0 ? `, ${rule.maxPaidGuests} paid` : ""})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Determines how many guests this person can bring
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQualifierDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleQualifierSubmit}
              disabled={!qualifierFormData.firstName || !qualifierFormData.lastName || !qualifierFormData.email || createQualifierMutation.isPending || updateQualifierMutation.isPending}
              data-testid="button-save-qualifier"
            >
              {createQualifierMutation.isPending || updateQualifierMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Qualifier Confirmation Dialog */}
      <AlertDialog open={qualifierDeleteDialogOpen} onOpenChange={setQualifierDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Person</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {qualifierToDelete?.firstName} {qualifierToDelete?.lastName} from the qualified list? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => qualifierToDelete && deleteQualifierMutation.mutate({ id: qualifierToDelete.id, eventId: qualifierToDelete.eventId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Registration Confirmation Dialog */}
      <AlertDialog open={registrationDeleteDialogOpen} onOpenChange={(open) => {
        setRegistrationDeleteDialogOpen(open);
        if (!open) setSendCancellationEmail(true); // Reset when closing
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Registration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the registration for {registrationToDelete?.firstName} {registrationToDelete?.lastName} ({registrationToDelete?.email})? 
              This will permanently remove their registration and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <Checkbox 
              id="send-cancel-email" 
              checked={sendCancellationEmail}
              onCheckedChange={(checked) => setSendCancellationEmail(checked === true)}
              data-testid="checkbox-send-cancellation-email"
            />
            <Label htmlFor="send-cancel-email" className="text-sm font-normal cursor-pointer">
              Send cancellation email to attendee
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => registrationToDelete && deleteRegistrationMutation.mutate({ id: registrationToDelete.id, sendEmail: sendCancellationEmail })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteRegistrationMutation.isPending}
            >
              {deleteRegistrationMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={(open) => {
        setBulkDeleteDialogOpen(open);
        if (!open) setBulkSendCancellationEmail(true); // Reset when closing
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedPeople.size} Attendee(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPeople.size} selected attendee(s)? 
              This will permanently remove their data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <Checkbox 
              id="bulk-send-cancel-email" 
              checked={bulkSendCancellationEmail}
              onCheckedChange={(checked) => setBulkSendCancellationEmail(checked === true)}
              data-testid="checkbox-bulk-send-cancellation-email"
            />
            <Label htmlFor="bulk-send-cancel-email" className="text-sm font-normal cursor-pointer">
              Send cancellation emails to registered attendees
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                // Separate registrations from qualifiers
                const registrationIds = filteredPeople
                  .filter(p => selectedPeople.has(p.id) && p.type === "registration" && p.registration)
                  .map(p => p.registration!.id);
                const qualifierIds = filteredPeople
                  .filter(p => selectedPeople.has(p.id) && p.type === "qualifier" && p.qualifier)
                  .map(p => p.qualifier!.id);
                
                if (registrationIds.length > 0 || qualifierIds.length > 0) {
                  bulkDeleteMutation.mutate({ registrationIds, qualifierIds, sendEmail: bulkSendCancellationEmail });
                } else {
                  toast({ title: "Nothing to delete", description: "No attendees could be deleted.", variant: "destructive" });
                  setBulkDeleteDialogOpen(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedPeople.size} Attendee(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resend Confirmation Dialog (Single) */}
      <Dialog open={resendDialogOpen} onOpenChange={(open) => { setResendDialogOpen(open); if (!open) setResendRegistration(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resend Confirmation Email</DialogTitle>
            <DialogDescription>
              {resendRegistration && (
                <>Send confirmation email to <strong>{resendRegistration.firstName} {resendRegistration.lastName}</strong> ({resendRegistration.email})</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label>Email Language</Label>
              <Select value={resendLanguage} onValueChange={setResendLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish (Español)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResendDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (resendRegistration) {
                  resendConfirmationMutation.mutate({ 
                    registrationId: resendRegistration.id, 
                    language: resendLanguage 
                  });
                }
              }}
              disabled={resendConfirmationMutation.isPending}
              data-testid="button-send-confirmation"
            >
              <Send className="h-4 w-4 mr-2" />
              {resendConfirmationMutation.isPending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Resend Confirmation Dialog */}
      <Dialog open={bulkResendDialogOpen} onOpenChange={setBulkResendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resend Confirmation Emails</DialogTitle>
            <DialogDescription>
              Send confirmation emails to {selectedPeople.size} selected attendee(s)
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label>Email Language</Label>
              <Select value={bulkResendLanguage} onValueChange={setBulkResendLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish (Español)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                All selected attendees will receive emails in this language
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkResendDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                const registrationIds = filteredPeople
                  .filter(p => selectedPeople.has(p.id) && p.type === "registration" && p.registration)
                  .map(p => p.registration!.id);
                if (registrationIds.length > 0) {
                  bulkResendConfirmationMutation.mutate({ 
                    registrationIds, 
                    language: bulkResendLanguage 
                  });
                } else {
                  toast({ title: "No registrations selected", description: "Select at least one registered attendee", variant: "destructive" });
                }
              }}
              disabled={bulkResendConfirmationMutation.isPending}
              data-testid="button-bulk-send-confirmation"
            >
              <Send className="h-4 w-4 mr-2" />
              {bulkResendConfirmationMutation.isPending ? "Sending..." : `Send ${selectedPeople.size} Emails`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Qualifiers</DialogTitle>
            <DialogDescription>
              Review the data before importing
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Records to import:</span>
              <Badge>{csvData.length}</Badge>
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Name</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">ID</th>
                    <th className="text-left p-2 font-medium">Locale</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{row.firstName} {row.lastName}</td>
                      <td className="p-2 text-muted-foreground">{row.email}</td>
                      <td className="p-2">{row.unicityId || "-"}</td>
                      <td className="p-2">{row.locale === "es" ? "ES" : "EN"}</td>
                    </tr>
                  ))}
                  {csvData.length > 50 && (
                    <tr className="border-t">
                      <td colSpan={4} className="p-2 text-center text-muted-foreground">
                        ...and {csvData.length - 50} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="replaceExisting"
                checked={replaceExisting}
                onCheckedChange={(checked) => setReplaceExisting(!!checked)}
              />
              <Label htmlFor="replaceExisting" className="text-sm font-normal">
                Replace existing qualifiers (clear list before import)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => importMutation.mutate({ registrants: csvData, clearExisting: replaceExisting })}
              disabled={importMutation.isPending}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? "Importing..." : `Import ${csvData.length} Records`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer to Event Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={(open) => { setMoveDialogOpen(open); if (!open) setRegistrationToMove(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Attendee to Different Event</DialogTitle>
            <DialogDescription>
              {registrationToMove && (
                <>Transfer <strong>{registrationToMove.firstName} {registrationToMove.lastName}</strong> to a different event.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {(() => {
              const otherEvents = events?.filter(e => e.id !== registrationToMove?.eventId) || [];
              if (otherEvents.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No other events available to transfer this attendee to.
                  </p>
                );
              }
              return (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="target-event">Select Target Event</Label>
                  <Select value={targetEventId} onValueChange={setTargetEventId}>
                    <SelectTrigger id="target-event" data-testid="select-target-event">
                      <SelectValue placeholder="Choose an event..." />
                    </SelectTrigger>
                    <SelectContent>
                      {otherEvents.map(event => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}
            {registrationToMove && (
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <p>Currently registered for: {events?.find(e => e.id === registrationToMove.eventId)?.name || "Unknown Event"}</p>
                <div className="bg-muted/50 rounded-md p-3 mt-2">
                  <p className="font-medium text-foreground mb-1">What will be reset:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Check-in status</li>
                    <li>Badge print history</li>
                    <li>Swag assignments</li>
                  </ul>
                  <p className="mt-2 font-medium text-foreground mb-1">What will be kept:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Personal information</li>
                    <li>Guests & flights</li>
                    <li>Reimbursements</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (registrationToMove && targetEventId) {
                  moveToEventMutation.mutate({ registrationId: registrationToMove.id, newEventId: targetEventId });
                }
              }}
              disabled={!targetEventId || moveToEventMutation.isPending || (events?.filter(e => e.id !== registrationToMove?.eventId).length === 0)}
              data-testid="button-confirm-move"
            >
              {moveToEventMutation.isPending ? "Transferring..." : "Transfer Attendee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
