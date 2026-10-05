import React, { useState } from "react";
import { Mail } from "lucide-react";
import { AuthInput } from "./AuthInput";
import { PasswordInput } from "./PasswordInput";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import Cookies from "js-cookie";
import { useAuth } from "../../context/AuthContext";

export const LoginForm = () => {
  const [formData, setFormData] = useState({ email: "", password: "", rememberMe: false });
  const [errors, setErrors] = useState({ email: "", password: "", general: "" });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const validate = () => {
    let valid = true;
    const newErrors = { email: "", password: "", general: "" };

    if (!formData.email) {
      newErrors.email = "Please enter a valid email address.";
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address.";
      valid = false;
    }

    if (!formData.password) {
      newErrors.password = "Password is required.";
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({ email: "", password: "", general: "" });

    if (!validate()) return;

    setIsLoading(true);

    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}auth/login`,
        {
          email: formData.email,
          password: formData.password,
        },
        { withCredentials: true }
      );

      const responseData = response.data;
      console.log("response of login api", responseData);

      const { accessToken, user } = responseData.data || {};

      if (accessToken && user) {
        // Use AuthContext to save state and cookies globally
        login(user, accessToken);
      } else {
        throw new Error("Invalid response from server");
      }

      // Handle success
      console.log("Logged in successfully!");
      toast.success("Login successful!");
      navigate("/dashboard");
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || "Something went wrong.";
      toast.error(errorMessage);
      setErrors((prev) => ({ ...prev, general: errorMessage }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    // Clear error when user types
    if (errors[name] || errors.general) {
      setErrors((prev) => ({ ...prev, [name]: "", general: "" }));
    }
  };

  return (
    <div className="w-full max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-8 text-center sm:text-left">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mb-2">Welcome back 👋</h1>
        <p className="text-slate-500">Please enter your credentials to access your dashboard.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.general && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
            {errors.general}
          </div>
        )}

        <div className="space-y-4">
          <AuthInput
            label="Email Address"
            name="email"
            type="email"
            placeholder="admin@example.com"
            icon={Mail}
            value={formData.email}
            onChange={handleChange}
            error={errors.email}
            disabled={isLoading}
          />

          <div className="space-y-1">
            <PasswordInput
              label="Password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
              disabled={isLoading}
            />

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  disabled={isLoading}
                />
                <label
                  htmlFor="rememberMe"
                  className="text-sm font-medium leading-none text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Remember me
                </label>
              </div>
              <a
                href="#"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 hover:underline transition-colors focus:outline-none focus:underline"
              >
                Forgot Password?
              </a>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 text-[15px]"
          isLoading={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </div>
  );
};
