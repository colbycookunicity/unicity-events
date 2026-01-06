import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Package, Edit, Trash2, Users, Check, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataTable } from "@/components/DataTable";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Event, SwagItemWithStats, SwagAssignmentWithDetails, Registration } from "@shared/schema";
import { CheckCircle } from "lucide-react";

const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

export default function SwagPage() {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SwagItemWithStats | null>(null);
  const [itemToDelete, setItemToDelete] = useState<SwagItemWithStats | null>(null);
  const [itemToAssign, setItemToAssign] = useState<SwagItemWithStats | null>(null);
  const [selectedRegistrations, setSelectedRegistrations] = useState<string[]>([]);
  const [assignSize, setAssignSize] = useState("");
  const [assignSearch, setAssignSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    nameEs: "",
    description: "",
    category: "",
    sizeRequired: false,
    sizeField: "",
    totalQuantity: 0,
    sortOrder: 0,
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: swagItems, isLoading } = useQuery<SwagItemWithStats[]>({
    queryKey: [`/api/events/${eventFilter}/swag-items`],
    enabled: eventFilter !== "all",
  });

  const { data: registrations } = useQuery<Registration[]>({
    queryKey: [`/api/registrations?eventId=${eventFilter}`],
    enabled: eventFilter !== "all" && assignDialogOpen,
  });

  const { data: existingAssignments } = useQuery<SwagAssignmentWithDetails[]>({
    queryKey: [`/api/swag-items/${itemToAssign?.id}/assignments`],
    enabled: !!itemToAssign?.id && assignDialogOpen,
  });

  // Get set of registration IDs that already have this swag item assigned
  const alreadyAssignedIds = new Set(
    existingAssignments?.map(a => a.registrationId).filter(Boolean) as string[] || []
  );

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", `/api/events/${eventFilter}/swag-items`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/swag-items`] });
      setDialogOpen(false);
      resetForm();
      toast({ title: t("success"), description: "Swag item created successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to create swag item", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await apiRequest("PATCH", `/api/swag-items/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/swag-items`] });
      setDialogOpen(false);
      setEditingItem(null);
      resetForm();
      toast({ title: t("success"), description: "Swag item updated successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update swag item", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/swag-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/swag-items`] });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      toast({ title: t("success"), description: "Swag item deleted successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to delete swag item", variant: "destructive" });
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async (data: { swagItemId: string; registrationIds: string[]; size?: string }) => {
      const response = await apiRequest("POST", "/api/swag-assignments/bulk", data);
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/swag-items`] });
      queryClient.invalidateQueries({ queryKey: [`/api/swag-items/${itemToAssign?.id}/assignments`] });
      // Invalidate swag assignments for all affected registrations so attendee drawer shows updated data
      variables.registrationIds.forEach(regId => {
        queryClient.invalidateQueries({ queryKey: [`/api/registrations/${regId}/swag-assignments`] });
      });
      // Also invalidate event-level swag assignments
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/swag-assignments`] });
      setAssignDialogOpen(false);
      setItemToAssign(null);
      setSelectedRegistrations([]);
      setAssignSize("");
      toast({ title: t("success"), description: "Swag assigned successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to assign swag", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      nameEs: "",
      description: "",
      category: "",
      sizeRequired: false,
      sizeField: "",
      totalQuantity: 0,
      sortOrder: 0,
    });
  };

  const handleAddNew = () => {
    setEditingItem(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleEdit = (item: SwagItemWithStats) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      nameEs: item.nameEs || "",
      description: item.description || "",
      category: item.category || "",
      sizeRequired: item.sizeRequired || false,
      sizeField: item.sizeField || "",
      totalQuantity: item.totalQuantity,
      sortOrder: item.sortOrder || 0,
    });
    setDialogOpen(true);
  };

  const handleDelete = (item: SwagItemWithStats) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleAssign = (item: SwagItemWithStats) => {
    setItemToAssign(item);
    setSelectedRegistrations([]);
    setAssignSize("");
    setAssignSearch("");
    setAssignDialogOpen(true);
  };

  // Filter registrations based on search
  const filteredRegistrations = registrations?.filter(reg => {
    if (!assignSearch.trim()) return true;
    const query = assignSearch.toLowerCase();
    return (
      reg.firstName.toLowerCase().includes(query) ||
      reg.lastName.toLowerCase().includes(query) ||
      reg.email.toLowerCase().includes(query) ||
      (reg.unicityId && reg.unicityId.toLowerCase().includes(query))
    );
  });

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleBulkAssign = () => {
    if (!itemToAssign || selectedRegistrations.length === 0) return;
    bulkAssignMutation.mutate({
      swagItemId: itemToAssign.id,
      registrationIds: selectedRegistrations,
      size: assignSize || undefined,
    });
  };

  const toggleRegistration = (id: string) => {
    setSelectedRegistrations(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const selectAllRegistrations = () => {
    if (!registrations) return;
    // Only select registrations that are not already assigned
    const unassignedIds = registrations
      .filter(r => !alreadyAssignedIds.has(r.id))
      .map(r => r.id);
    setSelectedRegistrations(unassignedIds);
  };

  const exportCSV = () => {
    if (!swagItems) return;
    
    const headers = ["Name", "Category", "Total Qty", "Assigned", "Received", "Remaining"];
    const rows = swagItems.map(item => [
      item.name,
      item.category || "",
      item.totalQuantity,
      item.assignedCount,
      item.receivedCount,
      item.remainingQuantity,
    ]);
    
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "swag-items.csv";
    a.click();
  };

  return (
    <div className="space-y-6" data-testid="page-swag">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Swag Management</h1>
          <p className="text-muted-foreground">Manage event merchandise and track distribution</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            onClick={exportCSV}
            disabled={!swagItems || swagItems.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button 
            onClick={handleAddNew} 
            disabled={eventFilter === "all"}
            data-testid="button-add-swag"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Swag Item
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-sm text-muted-foreground mb-2 block">Select Event</Label>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger data-testid="select-event-filter">
                  <SelectValue placeholder="Select an event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Select an event...</SelectItem>
                  {events?.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {language === "es" ? event.nameEs || event.name : event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {eventFilter === "all" ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Select an Event</h3>
            <p className="text-muted-foreground max-w-sm">
              Choose an event from the dropdown above to manage its swag items and assignments.
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="animate-pulse">Loading swag items...</div>
          </CardContent>
        </Card>
      ) : !swagItems || swagItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Swag Items</h3>
            <p className="text-muted-foreground max-w-sm mb-4">
              This event doesn't have any swag items yet. Add your first item to get started.
            </p>
            <Button onClick={handleAddNew} data-testid="button-add-first-swag">
              <Plus className="h-4 w-4 mr-2" />
              Add First Swag Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {swagItems.map((item) => {
            const assignedPercent = item.totalQuantity > 0 
              ? (item.assignedCount / item.totalQuantity) * 100 
              : 0;
            const receivedPercent = item.assignedCount > 0 
              ? (item.receivedCount / item.assignedCount) * 100 
              : 0;
            
            return (
              <Card key={item.id} data-testid={`card-swag-${item.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">
                      {language === "es" ? item.nameEs || item.name : item.name}
                    </CardTitle>
                    {item.category && (
                      <Badge variant="secondary" className="text-xs">
                        {item.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleEdit(item)}
                      data-testid={`button-edit-${item.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(item)}
                      data-testid={`button-delete-${item.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Inventory</span>
                      <span className="font-medium">{item.remainingQuantity} / {item.totalQuantity} available</span>
                    </div>
                    <Progress value={100 - assignedPercent} className="h-2" />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <div className="font-medium text-lg">{item.totalQuantity}</div>
                      <div className="text-muted-foreground text-xs">Total</div>
                    </div>
                    <div>
                      <div className="font-medium text-lg">{item.assignedCount}</div>
                      <div className="text-muted-foreground text-xs">Assigned</div>
                    </div>
                    <div>
                      <div className="font-medium text-lg">{item.receivedCount}</div>
                      <div className="text-muted-foreground text-xs">Received</div>
                    </div>
                  </div>
                  
                  {item.sizeRequired && (
                    <Badge variant="outline" className="text-xs">
                      Size Required
                    </Badge>
                  )}
                </CardContent>
                <CardFooter>
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => handleAssign(item)}
                    data-testid={`button-assign-${item.id}`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Assign to Attendees
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Swag Item" : "Add Swag Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update the swag item details below." : "Fill in the details for the new swag item."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (English)</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Event T-Shirt"
                data-testid="input-swag-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="nameEs">Name (Spanish)</Label>
              <Input
                id="nameEs"
                value={formData.nameEs}
                onChange={(e) => setFormData(prev => ({ ...prev, nameEs: e.target.value }))}
                placeholder="e.g., Camiseta del Evento"
                data-testid="input-swag-name-es"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description..."
                data-testid="input-swag-description"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., Apparel, Accessories"
                data-testid="input-swag-category"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="quantity">Total Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={0}
                value={formData.totalQuantity}
                onChange={(e) => setFormData(prev => ({ ...prev, totalQuantity: parseInt(e.target.value) || 0 }))}
                data-testid="input-swag-quantity"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="sizeRequired">Requires Size Selection</Label>
              <Switch
                id="sizeRequired"
                checked={formData.sizeRequired}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, sizeRequired: checked }))}
                data-testid="switch-size-required"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                data-testid="input-swag-sort-order"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!formData.name || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-swag"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Swag Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This will also remove all assignments for this item. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => itemToDelete && deleteMutation.mutate(itemToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Assign "{itemToAssign?.name}"</DialogTitle>
            <DialogDescription>
              Select attendees to assign this swag item to.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
            {itemToAssign?.sizeRequired && (
              <div className="space-y-2">
                <Label>Size</Label>
                <Select value={assignSize} onValueChange={setAssignSize}>
                  <SelectTrigger data-testid="select-assign-size">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_OPTIONS.map(size => (
                      <SelectItem key={size} value={size}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search attendees..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="pl-9"
                data-testid="input-assign-search"
              />
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedRegistrations.length} selected
                {alreadyAssignedIds.size > 0 && (
                  <span className="ml-2 text-xs">
                    ({alreadyAssignedIds.size} already assigned)
                  </span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={selectAllRegistrations}>
                Select All Unassigned
              </Button>
            </div>
            
            <div className="border rounded-md overflow-auto flex-1 max-h-[300px]">
              {filteredRegistrations?.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {assignSearch ? "No attendees match your search" : "No attendees found"}
                </div>
              ) : filteredRegistrations?.map(reg => {
                const isAlreadyAssigned = alreadyAssignedIds.has(reg.id);
                return (
                  <div
                    key={reg.id}
                    className={`flex items-center gap-3 p-3 border-b last:border-b-0 ${
                      isAlreadyAssigned 
                        ? "opacity-60 cursor-not-allowed" 
                        : "cursor-pointer hover-elevate"
                    } ${
                      selectedRegistrations.includes(reg.id) ? "bg-primary/10" : ""
                    }`}
                    onClick={() => !isAlreadyAssigned && toggleRegistration(reg.id)}
                    data-testid={`row-assign-${reg.id}`}
                  >
                    <div className={`h-5 w-5 rounded border flex items-center justify-center ${
                      isAlreadyAssigned 
                        ? "bg-muted border-muted-foreground/30"
                        : selectedRegistrations.includes(reg.id) 
                          ? "bg-primary border-primary text-primary-foreground" 
                          : "border-input"
                    }`}>
                      {isAlreadyAssigned ? (
                        <CheckCircle className="h-3 w-3 text-muted-foreground" />
                      ) : selectedRegistrations.includes(reg.id) ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        {reg.firstName} {reg.lastName}
                        {isAlreadyAssigned && (
                          <Badge variant="secondary" className="text-xs">
                            Already Assigned
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">{reg.email}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} data-testid="button-cancel-assign">
              Cancel
            </Button>
            <Button 
              onClick={handleBulkAssign}
              disabled={selectedRegistrations.length === 0 || bulkAssignMutation.isPending || (itemToAssign?.sizeRequired && !assignSize)}
              data-testid="button-confirm-assign"
            >
              {bulkAssignMutation.isPending ? "Assigning..." : `Assign to ${selectedRegistrations.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
