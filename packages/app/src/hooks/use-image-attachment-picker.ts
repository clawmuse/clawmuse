import { useCallback, useRef } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { getDesktopHost, isElectronRuntime } from "@/desktop/host";
import {
  normalizePickedImageAssets,
  pickImagesWithDesktopDialog,
  type PickedImageAttachmentInput,
} from "@/hooks/image-attachment-picker";
import { isWeb } from "@/constants/platform";

interface UseImageAttachmentPickerResult {
  pickImages: () => Promise<PickedImageAttachmentInput[] | null>;
}

export function useImageAttachmentPicker(): UseImageAttachmentPickerResult {
  const { t } = useTranslation();
  const isPickingRef = useRef(false);

  const pickImages = useCallback(async () => {
    if (isPickingRef.current) {
      return null;
    }

    isPickingRef.current = true;

    try {
      if (isWeb && isElectronRuntime()) {
        const selectedImages = await pickImagesWithDesktopDialog(getDesktopHost()?.dialog);
        if (selectedImages.length === 0) {
          return null;
        }
        return selectedImages;
      }

      const pendingResult = await ImagePicker.getPendingResultAsync();
      if (pendingResult && "canceled" in pendingResult && !pendingResult.canceled) {
        return await normalizePickedImageAssets(pendingResult.assets);
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as ImagePicker.MediaType[],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (result.canceled) {
        return null;
      }

      return await normalizePickedImageAssets(result.assets);
    } catch (error) {
      console.error("[ImageAttachmentPicker] Failed to pick image:", error);
      Alert.alert(t("imageAttachmentPicker.errorTitle"), t("imageAttachmentPicker.failedToSelect"));
      return null;
    } finally {
      isPickingRef.current = false;
    }
  }, [t]);

  return { pickImages };
}
