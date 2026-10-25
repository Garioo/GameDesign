import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "Foundry", short_name: "Foundry",
    description: "Your team's docs, canvases, boards and plans.",
    start_url: "/home", scope: "/", display: "standalone",
    background_color: "#f6f1e9", theme_color: "#f6f1e9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
