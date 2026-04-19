import { useEffect } from "react";

let lockCount = 0;
let prevOverflow = "";
let prevPaddingRight = "";

// Verrouille le scroll du body quand `active` est true.
// Gere aussi les cas ou plusieurs modals sont ouverts en meme temps (ref-count).
export default function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;

    lockCount += 1;

    if (lockCount === 1) {
      prevOverflow = document.body.style.overflow || "";
      prevPaddingRight = document.body.style.paddingRight || "";

      // Eviter un "saut" de layout quand la scrollbar disparait
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }
      document.body.classList.add("modal-open");
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = prevOverflow;
        document.body.style.paddingRight = prevPaddingRight;
        document.body.classList.remove("modal-open");
      }
    };
  }, [active]);
}

