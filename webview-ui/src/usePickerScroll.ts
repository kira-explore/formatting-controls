import { useCallback } from "react";

const visibleRows = 3;

export const usePickerScroll = <List extends HTMLElement>(
  count: number,
  selectedIndex: number,
) =>
  useCallback(
    (list: List | null) => {
      if (!list) return;
      if (count <= visibleRows) {
        list.style.removeProperty("max-height");
        return;
      }
      const rows = Array.from(list.children).slice(0, visibleRows);
      const lastVisible = rows.at(-1);
      if (!lastVisible) return;
      const measure = () => {
        const height =
          lastVisible.getBoundingClientRect().bottom -
          list.getBoundingClientRect().top +
          list.scrollTop;
        list.style.maxHeight = `${Math.ceil(height)}px`;
      };
      measure();
      const selected = list.children[selectedIndex];
      if (selected) {
        const viewport = list.getBoundingClientRect();
        const row = selected.getBoundingClientRect();
        if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top;
        else if (row.bottom > viewport.bottom)
          list.scrollTop += row.bottom - viewport.bottom;
      }
      const observer = new ResizeObserver(measure);
      for (const row of rows) observer.observe(row);
      return () => observer.disconnect();
    },
    [count, selectedIndex],
  );
