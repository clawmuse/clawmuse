import { Modal } from "@/components/ui/modal";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet } from "react-native-unistyles";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "@/components/icons/app-icons";
import { useTranslation } from "react-i18next";
import type { AttachmentMetadata } from "@/attachments/types";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { isNative, isWeb } from "@/constants/platform";
import { SPACING } from "@/styles/theme";
import { WindowChromeRootRegion } from "@/utils/desktop-window";
import { ZoomableImage } from "@/components/zoomable-viewport/image";
import type { ViewportSize } from "@/components/zoomable-viewport/geometry";
import { useGlobalWebOverlayLayer, useWebOverlayRegistration } from "@/lib/overlay-root";

export type ImageLightboxSource =
  | { type: "attachment"; metadata: AttachmentMetadata }
  | { type: "uri"; uri: string; contentSize?: ViewportSize };

interface AttachmentLightboxProps {
  source: ImageLightboxSource | null;
  onClose: () => void;
}

const ModalRoot = isNative ? GestureHandlerRootView : View;
const LIGHTBOX_FIT = { padding: SPACING[4], maxWidth: 960, maxHeight: 640 };

export function AttachmentLightbox({ source, onClose }: AttachmentLightboxProps) {
  const { t } = useTranslation();
  const metadata = source?.type === "attachment" ? source.metadata : null;
  const previewState = useAttachmentPreviewUrl(metadata);
  let url: string | null;
  if (source?.type === "uri") {
    url = source.uri;
  } else if (previewState.status === "ready") {
    url = previewState.url;
  } else {
    url = null;
  }
  const contentSize = source?.type === "uri" ? source.contentSize : undefined;
  const [errored, setErrored] = useState(false);
  const modalLayer = useGlobalWebOverlayLayer("modal", isWeb && source !== null);

  // A missing attachment means the blob is gone — close the lightbox rather than showing an
  // error for content that isn't there. Load failures and missing are different states.
  useEffect(() => {
    if (previewState.status === "missing") {
      onClose();
    }
  }, [previewState.status, onClose]);

  useEffect(() => {
    setErrored(false);
  }, [metadata?.id, url]);

  const handleWebOverlayKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return true;
    },
    [onClose],
  );
  const setWebOverlayScope = useWebOverlayRegistration({
    active: isWeb && source !== null,
    layer: modalLayer,
    onKeyDown: handleWebOverlayKeyDown,
  });

  const actions = useMemo(
    () => [
      {
        icon: X,
        label: t("message.attachments.closeImage"),
        onPress: onClose,
        testID: "attachment-lightbox-close",
        alwaysVisible: true,
      },
    ],
    [onClose, t],
  );

  const handleImageError = useCallback(() => setErrored(true), []);

  if (!source) {
    return null;
  }

  const hasError = errored || previewState.status === "error";

  return (
    <Modal transparent animationType="fade" statusBarTranslucent visible onRequestClose={onClose}>
      <ModalRoot style={styles.root}>
        {/* The modal is its own window: its insets are the window's, not the ones left where the
            image was opened (inside a sheet tab, the bottom one is already spent). */}
        <SafeAreaProvider>
          <WindowChromeRootRegion corners="both">
            <View ref={setWebOverlayScope} style={styles.root}>
              <Pressable
                testID="attachment-lightbox-backdrop"
                accessibilityRole="button"
                accessibilityLabel={t("message.attachments.dismissImage")}
                onPress={onClose}
                style={styles.backdrop}
              />
              <LightboxImageArea>
                {(() => {
                  if (hasError) {
                    return (
                      <Text style={styles.errorText}>
                        {t("message.attachments.imageLoadFailed")}
                      </Text>
                    );
                  }
                  if (url) {
                    return (
                      <ZoomableImage
                        accessibilityLabel={t("composer.attachments.openImage")}
                        actions={actions}
                        contentSize={contentSize}
                        fit={LIGHTBOX_FIT}
                        onError={handleImageError}
                        onPressOutsideContent={onClose}
                        style={styles.imageViewport}
                        testID="attachment-lightbox"
                        uri={url}
                      />
                    );
                  }
                  // Still resolving — empty area so the lightbox stays open and the backdrop
                  // shows the image is coming. Don't hand ZoomableImage a null uri.
                  return <View />;
                })()}
              </LightboxImageArea>
            </View>
          </WindowChromeRootRegion>
        </SafeAreaProvider>
      </ModalRoot>
    </Modal>
  );
}

function LightboxImageArea({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const style = useMemo(
    () => [
      styles.contentLayer,
      {
        paddingTop: insets.top,
        paddingRight: insets.right,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
      },
    ],
    [insets.bottom, insets.left, insets.right, insets.top],
  );
  return (
    <View pointerEvents="box-none" style={style}>
      <View pointerEvents="box-none" style={styles.imageArea}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  contentLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  imageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  imageViewport: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
  errorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
