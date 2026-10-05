import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import api from "../../services/api";
import toast from "react-hot-toast";

export function EmployeeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    department: "",
    designation: "",
    reportingManager: "",
    address: {
      city: "",
      state: "",
      pincode: "",
      locality: "",
      street: "",
      landmark: ""
    }
  });

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [managers, setManagers] = useState([]);
  const [managerSearch, setManagerSearch] = useState("");
  const [existingDocuments, setExistingDocuments] = useState([]);
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [documentRows, setDocumentRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(isEditMode);

  // Fetch departments and employee details if in edit mode
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [deptRes, managerRes] = await Promise.all([
          api.get("/admin/departments/list", { params: { status: "ACTIVE", limit: 100 } }),
          api.get("/admin/employees/list", { params: { picker: "1" } }),
        ]);
        setDepartments(deptRes.data.data || []);
        let people = managerRes.data.data || [];

        if (isEditMode) {
          const empRes = await api.get(`/admin/employees/details/${id}`);
          const employee = empRes.data.data;
          const manager = employee.reportingManager;
          if (manager?._id && !people.some((person) => person._id === manager._id)) {
            people = [...people, manager];
          }
          setManagers(people);
          
          setFormData({
            name: employee.name || "",
            email: employee.email || "",
            phone: employee.phone || "",
            password: "",
            department: employee.department?._id || employee.department || "",
            designation: employee.designation?._id || employee.designation || "",
            reportingManager: manager?._id || "",
            address: {
              city: employee.address?.city || "",
              state: employee.address?.state || "",
              pincode: employee.address?.pincode || "",
              locality: employee.address?.locality || "",
              street: employee.address?.street || "",
              landmark: employee.address?.landmark || ""
            }
          });
          setExistingDocuments(employee.documents || []);
          setRemovedDocumentIds([]);
        } else {
          setManagers(people);
        }
      } catch (error) {
        console.error("Failed to fetch initial data", error);
        toast.error("Failed to load data");
      } finally {
        setIsFetching(false);
      }
    };
    fetchInitialData();
  }, [id, isEditMode]);

  // Fetch designations based on selected department
  useEffect(() => {
    if (formData.department) {
      const fetchDesignations = async () => {
        try {
          const res = await api.get("/admin/designations/list", { params: { department: formData.department, status: "ACTIVE", limit: 100 } });
          setDesignations(res.data.data || []);
        } catch (error) {
          console.error("Failed to fetch designations", error);
        }
      };
      fetchDesignations();
    } else {
      setDesignations([]);
    }
  }, [formData.department]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (["city", "state", "pincode", "locality", "street", "landmark"].includes(name)) {
      setFormData(prev => ({ ...prev, address: { ...prev.address, [name]: value } }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const addDocumentRow = () => {
    setDocumentRows((rows) => [...rows, { key: `${Date.now()}-${rows.length}`, name: "", file: null }]);
  };

  const updateDocumentRow = (key, patch) => {
    setDocumentRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeDocumentRow = (key) => {
    setDocumentRows((rows) => rows.filter((row) => row.key !== key));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const filledRows = documentRows.filter((row) => row.name.trim() || row.file);
    if (filledRows.some((row) => !row.name.trim() || !row.file)) {
      toast.error("Har document ka naam aur file dono chahiye");
      return;
    }
    if (filledRows.some((row) => row.name.trim().length > 80)) {
      toast.error("Document name 80 characters se chhota hona chahiye");
      return;
    }
    const keptDocuments = existingDocuments.filter((doc) => !removedDocumentIds.includes(doc._id));
    if (keptDocuments.length + filledRows.length > 8) {
      toast.error("Ek employee par 8 documents tak add ho sakte hain");
      return;
    }

    try {
      setIsLoading(true);
      const payload = new FormData();
      payload.append("name", formData.name);
      payload.append("phone", formData.phone);
      payload.append("department", formData.department);
      payload.append("designation", formData.designation);
      payload.append("reportingManager", formData.reportingManager || "");
      payload.append("address", JSON.stringify(formData.address));
      if (!isEditMode) {
        payload.append("email", formData.email);
        payload.append("password", formData.password);
      }
      if (filledRows.length) {
        payload.append("documentNames", JSON.stringify(filledRows.map((row) => row.name.trim())));
        filledRows.forEach((row) => payload.append("documents", row.file));
      }
      if (isEditMode && removedDocumentIds.length) {
        payload.append("removeDocumentIds", JSON.stringify(removedDocumentIds));
      }

      if (isEditMode) {
        await api.patch(`/admin/employees/update/${id}`, payload);
        toast.success("Employee updated successfully");
      } else {
        await api.post("/admin/employees/create", payload);
        toast.success("Employee created successfully");
      }

      navigate("/dashboard/employees");
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return <div className="p-8 text-center text-slate-500">Loading data...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/employees")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isEditMode ? "Edit Employee" : "Create New Employee"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isEditMode ? "Update the employee's details and assignments." : "Fill in the details to add a new employee to the system."}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <form onSubmit={handleSubmit} className="divide-y divide-slate-100">
          
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-medium text-slate-900">Basic Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <Input name="name" value={formData.name} onChange={handleChange} required disabled={isLoading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <Input name="email" type="email" value={formData.email} onChange={handleChange} required disabled={isLoading || isEditMode} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                <Input name="phone" value={formData.phone} onChange={handleChange} required disabled={isLoading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {isEditMode ? "Password (leave blank to keep current)" : "Password *"}
                </label>
                <Input name="password" type="password" value={formData.password} onChange={handleChange} required={!isEditMode} disabled={isLoading} />
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4 bg-slate-50">
            <h3 className="text-lg font-medium text-slate-900">Job Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department *</label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select a department</option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Designation *</label>
                <select
                  name="designation"
                  value={formData.designation}
                  onChange={handleChange}
                  required
                  disabled={isLoading || !formData.department}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">Select a designation</option>
                  {designations.map((desig) => (
                    <option key={desig._id} value={desig._id}>{desig.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Reports to</label>
                <Input
                  value={managerSearch}
                  placeholder="Search manager by name or ID"
                  disabled={isLoading}
                  onChange={(event) => setManagerSearch(event.target.value)}
                  className="mb-2"
                />
                <select
                  name="reportingManager"
                  value={formData.reportingManager}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">No manager</option>
                  {managers
                    .filter((person) => person._id !== id)
                    .filter((person) => {
                      const haystack = `${person.name || ""} ${person.employeeId || ""} ${person.designation?.name || ""}`.toLowerCase();
                      return !managerSearch.trim() || haystack.includes(managerSearch.trim().toLowerCase()) || person._id === formData.reportingManager;
                    })
                    .map((person) => (
                      <option key={person._id} value={person._id}>
                        {person.name}{person.employeeId ? ` · ${person.employeeId}` : ""}{person.designation?.name ? ` · ${person.designation.name}` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <h3 className="text-lg font-medium text-slate-900">Address Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Street</label>
                <Input name="street" value={formData.address.street} onChange={handleChange} disabled={isLoading} />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Locality</label>
                <Input name="locality" value={formData.address.locality} onChange={handleChange} disabled={isLoading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Landmark</label>
                <Input name="landmark" value={formData.address.landmark} onChange={handleChange} disabled={isLoading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                <Input name="city" value={formData.address.city} onChange={handleChange} disabled={isLoading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                <Input name="state" value={formData.address.state} onChange={handleChange} disabled={isLoading} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pincode</label>
                <Input name="pincode" value={formData.address.pincode} onChange={handleChange} disabled={isLoading} />
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4 bg-slate-50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-medium text-slate-900">Documents</h3>
                <p className="text-sm text-slate-500 mt-1">Optional. Document ka naam likho aur PDF ya image attach karo. Files Cloudinary par save hongi.</p>
              </div>
              <Button type="button" variant="outline" className="gap-2" onClick={addDocumentRow} disabled={isLoading}>
                <Plus className="h-4 w-4" />
                Add document
              </Button>
            </div>

            {existingDocuments.filter((doc) => !removedDocumentIds.includes(doc._id)).length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {existingDocuments
                  .filter((doc) => !removedDocumentIds.includes(doc._id))
                  .map((doc) => (
                    <div key={doc._id} className="flex items-center gap-3 rounded-lg border border-indigo-100 bg-white px-3 py-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{doc.name}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-400">{doc.format || doc.resourceType || "file"}</p>
                      </div>
                      <a href={doc.url} target="_blank" rel="noreferrer" className="rounded-md p-2 text-indigo-700 hover:bg-indigo-50" title="View">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => setRemovedDocumentIds((ids) => [...ids, doc._id])}
                        className="rounded-md p-2 text-rose-600 hover:bg-rose-50"
                        title="Remove"
                        disabled={isLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {documentRows.length === 0 && existingDocuments.filter((doc) => !removedDocumentIds.includes(doc._id)).length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                Koi document add nahi kiya. Employee bina documents ke bhi save ho sakta hai.
              </p>
            )}

            {documentRows.length > 0 && (
              <div className="space-y-3">
                {documentRows.map((row, index) => (
                  <div key={row.key} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1.2fr_auto] sm:items-end">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Document name</label>
                      <Input
                        value={row.name}
                        placeholder="Aadhaar, PAN, photo"
                        maxLength={80}
                        disabled={isLoading}
                        onChange={(event) => updateDocumentRow(row.key, { name: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">PDF or image</label>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp,image/avif"
                        disabled={isLoading}
                        onChange={(event) => updateDocumentRow(row.key, { file: event.target.files?.[0] || null })}
                        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-indigo-800"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDocumentRow(row.key)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm text-rose-600 hover:bg-rose-50"
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sm:hidden">Remove {index + 1}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-6 bg-white flex items-center justify-end gap-3 rounded-b-xl">
            <Button type="button" variant="outline" onClick={() => navigate("/dashboard/employees")} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-[120px]">
              {isLoading ? "Saving..." : (isEditMode ? "Update Employee" : "Create Employee")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
