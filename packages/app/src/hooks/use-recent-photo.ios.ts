import { useCallback, useEffect, useMemo, useState } from "react";
import { isFdroidBuild } from "@/constants/build-profile";
import {
  resolveRecentPhoto,
  toRecentPhotoRow,
  type RecentPhotoAssetLike,
  type RecentPhotoPermissionStatus,
  type UseRecentPhotoResult,
} from "@/hooks/recent-photo";

type MediaLibraryModule = typeof import("expo-media-library/legacy");
type MediaLibraryAssetsOptions = Parameters<MediaLibraryModule["getAssetsAsync"]>[0];

// expo-media-library resolves its native module at import time, and the F-Droid build ships
// without it — so the require stays lazy and every call site is guarded.
let mediaLibraryModule: MediaLibraryModule | null | undefined;

function getMediaLibrary(): MediaLibraryModule | null {
  if (mediaLibraryModule !== undefined) return mediaLibraryModule;
  try {
    // SDK 57 keeps these function APIs in /legacy; the root exports throw at runtime.
    mediaLibraryModule = require("expo-media-library/legacy") as MediaLibraryModule;
  } catch {
    mediaLibraryModule = null;
  }
  return mediaLibraryModule;
}

const LATEST_PHOTO_QUERY: MediaLibraryAssetsOptions = {
  first: 1,
  mediaType: ["photo"],
  sortBy: [["creationTime", false]], // false = newest first
};

function toAssetLike(asset: { uri: string; filename: string }): RecentPhotoAssetLike {
  return { uri: asset.uri, localUri: null, filename: asset.filename };
}

async function queryLatestAsset(ml: MediaLibraryModule): Promise<RecentPhotoAssetLike | null> {
  const page = await ml.getAssetsAsync(LATEST_PHOTO_QUERY);
  const asset = page.assets[0];
  return asset ? toAssetLike(asset) : null;
}

async function takeAttachableLatestPhoto(
  ml: MediaLibraryModule,
): Promise<RecentPhotoAssetLike | null> {
  // Tapping should attach the newest photo even if one landed after the menu opened, so
  // this re-queries instead of reading the row state.
  const page = await ml.getAssetsAsync(LATEST_PHOTO_QUERY);
  const asset = page.assets[0];
  if (!asset) return null;
  // iOS `ph://` URIs don't survive the attachment persister; the attachable file-scheme
  // URI comes from asset info.
  if (!asset.uri.startsWith("file://")) {
    const info = await ml.getAssetInfoAsync(asset);
    return { ...toAssetLike(asset), localUri: info.localUri ?? null };
  }
  return toAssetLike(asset);
}

function toPermissionStatus(
  permission: Awaited<ReturnType<MediaLibraryModule["getPermissionsAsync"]>>,
): RecentPhotoPermissionStatus {
  if (!permission.granted) {
    return permission.canAskAgain === false ? "denied" : "undetermined";
  }
  // `accessPrivileges` predates the limited-picker era only when it is absent;
  // any explicit non-"all" value keeps the row off the prefetch path.
  return permission.accessPrivileges === "all" || permission.accessPrivileges === undefined
    ? "granted"
    : "limited";
}

export function useRecentPhoto(): UseRecentPhotoResult {
  const [permission, setPermission] = useState<RecentPhotoPermissionStatus>("undetermined");
  const [latestAsset, setLatestAsset] = useState<RecentPhotoAssetLike | null>(null);

  const refresh = useCallback(async (ml: MediaLibraryModule) => {
    const current = await ml.getPermissionsAsync();
    const status = toPermissionStatus(current);
    setPermission(status);
    // Reading assets under limited access makes iOS surface its "Select More Photos"
    // escalation alert without a user action — e.g. on every cold start once the
    // composer mounts. Only prefetch the thumbnail under full access.
    setLatestAsset(status === "granted" ? await queryLatestAsset(ml) : null);
  }, []);

  useEffect(() => {
    if (isFdroidBuild) return;
    const ml = getMediaLibrary();
    if (!ml) {
      setPermission("unavailable");
      return;
    }
    let cancelled = false;
    void refresh(ml).catch((error: unknown) => {
      console.error("[RecentPhoto] Failed to load latest photo:", error);
      if (!cancelled) setPermission("unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const row = useMemo(
    () =>
      toRecentPhotoRow({
        mediaLibraryAvailable: !isFdroidBuild,
        permission,
        latestAsset,
      }),
    [permission, latestAsset],
  );

  const takeRecentPhoto = useCallback(async () => {
    if (isFdroidBuild) return null;
    const ml = getMediaLibrary();
    if (!ml) return null;
    try {
      let current = await ml.getPermissionsAsync();
      if (!current.granted && current.canAskAgain) {
        current = await ml.requestPermissionsAsync();
      }
      if (!current.granted) {
        return null;
      }
      const asset = await takeAttachableLatestPhoto(ml);
      const ready = asset ? resolveRecentPhoto(asset) : null;
      // Upgrade the row so the next menu open shows the real thumbnail instead of the
      // placeholder this press started from.
      void refresh(ml).catch(() => undefined);
      return ready?.picked ?? null;
    } catch (error) {
      console.error("[RecentPhoto] Failed to attach latest photo:", error);
      return null;
    }
  }, [refresh]);

  return useMemo(() => ({ row, takeRecentPhoto }), [row, takeRecentPhoto]);
}
