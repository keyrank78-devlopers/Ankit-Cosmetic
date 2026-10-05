import React from "react";
import authImage from "../assets/auth.webp";

export const AuthLayout = ({ children }) => {
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-white">
      {/* Left Panel - Brand image (hidden below lg) */}
      <div className="hidden h-full min-h-0 lg:flex lg:w-1/2 flex-col overflow-hidden border-r border-slate-100 bg-white px-6 py-6 xl:px-10 xl:py-8">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <img
            src={authImage}
            alt="Grandeur Net"
            className="h-full w-full object-contain"
          />
        </div>

        {/* <div className="shrink-0 pt-3 text-sm font-medium text-slate-500">
          &copy; {new Date().getFullYear()} AK Techs. All rights reserved.
        </div> */}
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-gradient-to-br from-white via-indigo-50/40 to-slate-50 px-5 py-4 sm:px-10 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[420px] flex-col items-center justify-center gap-3 sm:gap-5">
          <img
            src={authImage}
            alt="Grandeur Net"
            className="max-h-[26dvh] min-h-0 w-full flex-1 object-contain lg:hidden"
          />

          <div className="w-full shrink-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
