import { forwardRef, useCallback, useEffect, useState, type ElementRef } from "react";
import type { TextInputProps } from "react-native";

import type { SheetAwareTextInput } from "@/components/ui/text-input/sheet-aware";
import { useEditingKeepAwake } from "@/composer/input/use-editing-keep-awake";

export const TextInput = forwardRef<ElementRef<typeof SheetAwareTextInput>, TextInputProps>(
  function TextInput(props, ref) {
    const { onFocus, onBlur, onChangeText, onSubmitEditing } = props;
    const [focused, setFocused] = useState(false);
    const { recordActivity, finish } = useEditingKeepAwake(
      focused && props.editable !== false && !props.readOnly,
      "input",
    );
    useEffect(() => {
      if (props.value === "") finish();
    }, [props.value, finish]);
    const handleFocus = useCallback<NonNullable<TextInputProps["onFocus"]>>(
      (event) => {
        setFocused(true);
        onFocus?.(event);
      },
      [onFocus],
    );
    const handleBlur = useCallback<NonNullable<TextInputProps["onBlur"]>>(
      (event) => {
        setFocused(false);
        finish();
        onBlur?.(event);
      },
      [finish, onBlur],
    );
    const handleChangeText = useCallback(
      (text: string) => {
        if (text) recordActivity();
        else finish();
        onChangeText?.(text);
      },
      [recordActivity, finish, onChangeText],
    );
    const handleSubmitEditing = useCallback<NonNullable<TextInputProps["onSubmitEditing"]>>(
      (event) => {
        finish();
        onSubmitEditing?.(event);
      },
      [finish, onSubmitEditing],
    );
    const { SheetAwareTextInput } =
      require("../../components/ui/text-input/sheet-aware") as typeof import("../../components/ui/text-input/sheet-aware");
    return (
      <SheetAwareTextInput
        {...props}
        ref={ref}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChangeText={handleChangeText}
        onSubmitEditing={handleSubmitEditing}
      />
    );
  },
);
