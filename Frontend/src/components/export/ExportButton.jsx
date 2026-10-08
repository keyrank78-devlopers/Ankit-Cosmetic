import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../ui/Button";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const saveBlob = async (response, fallbackName) => {
  const type = response.headers["content-type"] || "";
  if (type.includes("application/json")) {
    const text = await response.data.text();
    const body = JSON.parse(text);
    throw new Error(body.message || "Could not download the file");
  }
  const match = /filename="([^"]+)"/.exec(response.headers["content-disposition"] || "");
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] || fallbackName;
  link.click();
  URL.revokeObjectURL(url);
};

const errorMessage = async (error, fallback) => {
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      const body = JSON.parse(await data.text());
      return body.message || fallback;
    } catch {
      return fallback;
    }
  }
  return data?.message || error.message || fallback;
};

export function ExportButton({ type, filters }) {
  const { user } = useAuth();
  const isAdmin = user?.userType === "ADMIN";
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadMine = useCallback(async () => {
    if (isAdmin) return;
    try {
      const res = await api.get("/admin/exports/mine", { params: { type } });
      setRequest(res.data.data || null);
    } catch {
      setRequest(null);
    }
  }, [isAdmin, type]);

  useEffect(() => {
    loadMine();
    window.addEventListener("focus", loadMine);
    return () => window.removeEventListener("focus", loadMine);
  }, [loadMine]);

  const download = async () => {
    setBusy(true);
    try {
      const response = isAdmin
        ? await api.get("/admin/exports/file", { params: { type, ...filters }, responseType: "blob" })
        : await api.get(`/admin/exports/${request._id}/file`, { responseType: "blob" });
      await saveBlob(response, `${type.toLowerCase()}.xlsx`);
      if (!isAdmin) setRequest(null);
    } catch (error) {
      toast.error(await errorMessage(error, "Could not download the file"));
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    setBusy(true);
    try {
      const res = await api.post("/admin/exports/request", { type, filters });
      setRequest(res.data.data);
      toast.success(res.data.message || "Request sent");
    } catch (error) {
      toast.error(await errorMessage(error, "Could not send the request"));
    } finally {
      setBusy(false);
    }
  };

  if (isAdmin) {
    return (
      <Button type="button" variant="outline" disabled={busy} onClick={download}>
        <Download className="mr-2 h-4 w-4" />
        Export Excel
      </Button>
    );
  }

  if (request?.status === "APPROVED") {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button type="button" disabled={busy} onClick={download}>
          <Download className="mr-2 h-4 w-4" />
          Download Excel
        </Button>
        <p className="text-xs text-slate-500">Admin approved this file. It uses the filters from the request.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" disabled={busy} onClick={ask}>
        <Download className="mr-2 h-4 w-4" />
        {request?.status === "PENDING" ? "Update request" : "Request Excel"}
      </Button>
      {request?.status === "PENDING" && <p className="text-xs text-slate-500">Waiting for admin. Update sends the filters that are on the page now.</p>}
    </div>
  );
}
