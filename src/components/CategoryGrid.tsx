import type { Category } from "../types/api";

interface CategoryGridProps {
  categories: Category[];
  onCategoryClick: (categoryName: string) => void;
}

export function CategoryGrid({
  categories,
  onCategoryClick,
}: CategoryGridProps) {
  if (!categories || categories.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "8px",
        marginTop: "12px",
        marginBottom: "8px",
      }}
    >
      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => onCategoryClick(category.name)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px",
            fontSize: "14px",
            fontWeight: "500",
            color: "#374151",
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
            cursor: "pointer",
            transition: "all 0.2s ease-in-out",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#eff6ff";
            e.currentTarget.style.borderColor = "#93c5fd";
            e.currentTarget.style.color = "#1d4ed8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#ffffff";
            e.currentTarget.style.borderColor = "#e5e7eb";
            e.currentTarget.style.color = "#374151";
          }}
        >
          {category.name.replace("&amp;", "&")}
          {category.count !== undefined && category.count > 0 && (
            <span
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "4px",
                fontWeight: "normal",
              }}
            >
              {category.count} items
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
