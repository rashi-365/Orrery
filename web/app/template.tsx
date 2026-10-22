"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Wraps every page so it fades in and rises slightly on navigation. Short, with no bounce. */
export default function Template({ children }: { readonly children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
