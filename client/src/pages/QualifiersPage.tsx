import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Upload, Trash2, Search, Download, Edit2 } from "lucide-react";
import type { Event, QualifiedRegistrant } from "@shared/schema";

export default function QualifiersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [eventFilter, setEventFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQualifier, setEditingQualifier] = useState<QualifiedRegistrant | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [qualifierToDelete, setQualifierToDelete] = useState<QualifiedRegistrant | null>(null);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [csvData, setCsvData] = useState<Array<{ firstName: string; lastName: string; email: string; unicityId: string }>>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    unicityId: "",
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events"],
  });

  const { data: qualifiers, isLoading } = useQuery<QualifiedRegistrant[]>({
    queryKey: [`/api/events/${eventFilter}/qualifiers`],
    enabled: !!eventFilter,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", `/api/events/${eventFilter}/qualifiers`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/qualifiers`] });
      setDialogOpen(false);
      resetForm();
      toast({ title: t("success"), description: "Qualifier added successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to add qualifier", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await apiRequest("PATCH", `/api/qualifiers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/qualifiers`] });
      setDialogOpen(false);
      setEditingQualifier(null);
      resetForm();
      toast({ title: t("success"), description: "Qualifier updated successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to update qualifier", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/qualifiers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/qualifiers`] });
      setDeleteDialogOpen(false);
      setQualifierToDelete(null);
      toast({ title: t("success"), description: "Qualifier removed successfully" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to remove qualifier", variant: "destructive" });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/events/${eventFilter}/qualifiers`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventFilter}/qualifiers`] });
      setClearAllDialogOpen(false);
      toast({ title: t("success"), description: "All qualifiers cleared" });
    },
    onError: () => {
      toast({ title: t("error"), description: "Failed to clear qualifiers", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { registrants: typeof csvData; clearExisting: boolean }) => {
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

  const resetForm = () => {
    setFormData({ firstName: "", lastName: "", email: "", unicityId: "" });
  };

  const handleEditClick = (qualifier: QualifiedRegistrant) => {
    setEditingQualifier(qualifier);
    setFormData({
      firstName: qualifier.firstName,
      lastName: qualifier.lastName,
      email: qualifier.email,
      unicityId: qualifier.unicityId || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingQualifier) {
      updateMutation.mutate({ id: editingQualifier.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
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
      const idIdx = headers.findIndex(h => h.includes("id") || h.includes("uid"));

      if (firstNameIdx === -1 || lastNameIdx === -1 || emailIdx === -1) {
        toast({ 
          title: t("error"), 
          description: "CSV must have columns for First Name, Last Name, and Email", 
          variant: "destructive" 
        });
        return;
      }

      const parsed: Array<{ firstName: string; lastName: string; email: string; unicityId: string }> = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/"/g, "").replace(/^ /, ""));
        
        if (values.length >= 3 && values[emailIdx]) {
          parsed.push({
            firstName: values[firstNameIdx] || "",
            lastName: values[lastNameIdx] || "",
            email: values[emailIdx] || "",
            unicityId: idIdx !== -1 ? (values[idIdx] || "") : "",
          });
        }
      }

      if (parsed.length === 0) {
        toast({ title: t("error"), description: "No valid rows found in CSV", variant: "destructive" });
        return;
      }

      setCsvData(parsed);
      setImportDialogOpen(true);
    };

    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const exportCSV = () => {
    if (!qualifiers?.length) return;
    
    const headers = ["First Name", "Last Name", "Email", "Unicity ID"];
    const rows = qualifiers.map(q => [
      q.firstName,
      q.lastName,
      q.email,
      q.unicityId || ""
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qualifiers-${eventFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredQualifiers = qualifiers?.filter(q => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      q.firstName.toLowerCase().includes(query) ||
      q.lastName.toLowerCase().includes(query) ||
      q.email.toLowerCase().includes(query) ||
      (q.unicityId && q.unicityId.toLowerCase().includes(query))
    );
  });

  const selectedEvent = events?.find(e => e.id === eventFilter);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Qualified Registrants</h1>
          <p className="text-muted-foreground">
            Manage the list of people allowed to register for each event
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-[220px]" data-testid="select-event-filter">
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent>
              {events?.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!eventFilter ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">Select an event to manage its qualifiers</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-qualifiers"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-csv"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
              {qualifiers && qualifiers.length > 0 && (
                <>
                  <Button variant="outline" onClick={exportCSV} data-testid="button-export-csv">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setClearAllDialogOpen(true)}
                    data-testid="button-clear-all"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All
                  </Button>
                </>
              )}
              <Button
                onClick={() => {
                  setEditingQualifier(null);
                  resetForm();
                  setDialogOpen(true);
                }}
                data-testid="button-add-qualifier"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Qualifier
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {selectedEvent?.name}
                {qualifiers && (
                  <Badge variant="secondary">{qualifiers.length} qualifiers</Badge>
                )}
              </CardTitle>
              <CardDescription>
                People on this list will be allowed to register for this event
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : !filteredQualifiers?.length ? (
                <div className="py-8 text-center text-muted-foreground">
                  {searchQuery ? "No qualifiers match your search" : "No qualifiers yet. Upload a CSV or add them manually."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium">Name</th>
                        <th className="text-left py-3 px-2 font-medium">Email</th>
                        <th className="text-left py-3 px-2 font-medium">Unicity ID</th>
                        <th className="text-right py-3 px-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQualifiers.map((qualifier) => (
                        <tr key={qualifier.id} className="border-b last:border-0" data-testid={`row-qualifier-${qualifier.id}`}>
                          <td className="py-3 px-2">
                            {qualifier.firstName} {qualifier.lastName}
                          </td>
                          <td className="py-3 px-2 text-muted-foreground">
                            {qualifier.email}
                          </td>
                          <td className="py-3 px-2">
                            {qualifier.unicityId || "-"}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditClick(qualifier)}
                                data-testid={`button-edit-${qualifier.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setQualifierToDelete(qualifier);
                                  setDeleteDialogOpen(true);
                                }}
                                data-testid={`button-delete-${qualifier.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingQualifier ? "Edit Qualifier" : "Add Qualifier"}</DialogTitle>
            <DialogDescription>
              {editingQualifier 
                ? "Update the qualifier's information" 
                : "Add a new person to the qualified registrants list"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  data-testid="input-first-name"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                data-testid="input-email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="unicityId">Unicity ID (optional)</Label>
              <Input
                id="unicityId"
                value={formData.unicityId}
                onChange={(e) => setFormData(prev => ({ ...prev, unicityId: e.target.value }))}
                data-testid="input-unicity-id"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.firstName || !formData.lastName || !formData.email || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-qualifier"
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Qualifiers</DialogTitle>
            <DialogDescription>
              Review the data before importing
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-between">
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
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{row.firstName} {row.lastName}</td>
                      <td className="p-2 text-muted-foreground">{row.email}</td>
                      <td className="p-2">{row.unicityId || "-"}</td>
                    </tr>
                  ))}
                  {csvData.length > 50 && (
                    <tr className="border-t">
                      <td colSpan={3} className="p-2 text-center text-muted-foreground">
                        ...and {csvData.length - 50} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="replaceExisting"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="h-4 w-4"
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Qualifier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {qualifierToDelete?.firstName} {qualifierToDelete?.lastName} from the qualifiers list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => qualifierToDelete && deleteMutation.mutate(qualifierToDelete.id)}
              data-testid="button-confirm-delete"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Qualifiers</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove all {qualifiers?.length} qualifiers for this event? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearAllMutation.mutate()}
              data-testid="button-confirm-clear-all"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
