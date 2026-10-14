// Small wrappers around HeroUI's compound components, so pages stay short.
import { Description, Input, Label, ListBox, Modal, Select, Separator, Switch, TextArea, TextField } from "@heroui/react";
import { Fragment, type ReactNode } from "react";

export function Dialog(props: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <Modal isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container size={props.size ?? "md"}>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{props.title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">{props.children}</Modal.Body>
            {props.footer && <Modal.Footer>{props.footer}</Modal.Footer>}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function TextInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  // Keep the label for screen readers only, e.g. inside a table row.
  hideLabel?: boolean;
}) {
  return (
    <TextField value={props.value} onChange={props.onChange} autoFocus={props.autoFocus} fullWidth>
      <Label className={props.hideLabel ? "sr-only" : undefined}>{props.label}</Label>
      {props.multiline ? (
        <TextArea variant="secondary" placeholder={props.placeholder} rows={2} />
      ) : (
        <Input variant="secondary" placeholder={props.placeholder} />
      )}
      {props.description && <Description>{props.description}</Description>}
    </TextField>
  );
}

export function Choice<K extends string>(props: {
  label: string;
  value: K;
  onChange: (value: K) => void;
  // `divider` draws a line above an option, to set it apart from the ones before.
  options: Array<{ id: K; label: string; description?: string; divider?: boolean }>;
  description?: string;
  hideLabel?: boolean;
}) {
  return (
    <Select
      selectedKey={props.value}
      onSelectionChange={(key) => key != null && props.onChange(String(key) as K)}
      fullWidth
      variant="secondary"
    >
      <Label className={props.hideLabel ? "sr-only" : undefined}>{props.label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      {props.description && <Description>{props.description}</Description>}
      <Select.Popover>
        <ListBox>
          {props.options.map((o) => (
            <Fragment key={o.id}>
              {o.divider && <Separator className="my-1.5 bg-default-foreground/25" />}
              <ListBox.Item id={o.id} textValue={o.label}>
                <div className="flex flex-col">
                  <span>{o.label}</span>
                  {o.description && <span className="text-xs text-muted">{o.description}</span>}
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </Fragment>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function Toggle(props: { label: string; isSelected: boolean; onChange: (on: boolean) => void }) {
  return (
    <Switch isSelected={props.isSelected} onChange={props.onChange}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Label>{props.label}</Label>
      </Switch.Content>
    </Switch>
  );
}
