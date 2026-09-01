import { h } from "@jam/core/jsx";
import type { VNode } from "@jam/core/jsx";
import {
  XStack,
  YStack,
  H2,
  H4,
  Paragraph,
  SizableText,
  Button,
  Input,
  Card,
  Sheet,
  Separator,
  XGroup,
  Group,
  RadioGroup,
  ToggleGroup,
  Accordion,
  Circle,
  useStableId,
  useControllableState,
} from "@jam/ui";
import type { ExampleDemos } from "../../types";
import { useDemoState } from "../state";
import { Page } from "./shared";
import type { IconProps } from "./icons";
import {
  SearchIcon,
  ShoppingCartIcon,
  StarIcon,
  HeartIcon,
  ZapIcon,
  LayersIcon,
  ShieldIcon,
  ClockIcon,
  SunIcon,
  PlusIcon,
  MinusIcon,
  CheckIcon,
  XIcon,
  Trash2Icon,
} from "./icons";

type Category = "Audio" | "Wearables" | "Home";
type Product = {
  id: string;
  name: string;
  category: Category;
  price: number;
  rating: number;
  reviews: number;
  theme: string;
  Icon: (props: IconProps) => VNode;
};

const products: Product[] = [
  { id: "pulse", name: "Pulse Earbuds", category: "Audio", price: 129, rating: 5, reviews: 1284, theme: "blue", Icon: ZapIcon },
  { id: "beam", name: "Beam Speaker", category: "Audio", price: 199, rating: 4, reviews: 862, theme: "purple", Icon: LayersIcon },
  { id: "orbit", name: "Orbit Watch", category: "Wearables", price: 249, rating: 4, reviews: 2130, theme: "green", Icon: ClockIcon },
  { id: "halo", name: "Halo Band", category: "Wearables", price: 79, rating: 3, reviews: 415, theme: "pink", Icon: HeartIcon },
  { id: "glow", name: "Glow Lamp", category: "Home", price: 59, rating: 5, reviews: 690, theme: "yellow", Icon: SunIcon },
  { id: "sentinel", name: "Sentinel Cam", category: "Home", price: 149, rating: 4, reviews: 977, theme: "orange", Icon: ShieldIcon },
];

const filters = ["All", "Audio", "Wearables", "Home"] as const;
const freeShippingOver = 100;
const shippingFee = 8;

type Cart = Record<string, number>;

function useCart(): { cart: Cart; count: number; add: (id: string, delta?: number) => void; remove: (id: string) => void } {
  const [json, setJson] = useDemoState("store.cart", "{}");
  const cart = JSON.parse(json) as Cart;
  const write = (next: Cart) => setJson(JSON.stringify(next));
  return {
    cart,
    count: Object.values(cart).reduce((sum, qty) => sum + qty, 0),
    add: (id, delta = 1) => {
      const qty = (cart[id] ?? 0) + delta;
      const { [id]: _, ...rest } = cart;
      write(qty > 0 ? { ...rest, [id]: qty } : rest);
    },
    remove: (id) => {
      const { [id]: _, ...rest } = cart;
      write(rest);
    },
  };
}

const money = (amount: number) => `$${amount.toFixed(2)}`;

function ProductTile({ product, height, iconSize, radius = "$radius.4" }: { product: Product; height: number; iconSize: number; radius?: string | number }) {
  return (
    <YStack
      theme={product.theme}
      backgroundColor="$color3"
      color="$color10"
      height={height}
      width="100%"
      borderRadius={radius}
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      <product.Icon size={iconSize} strokeWidth={1.5} />
    </YStack>
  );
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <XStack gap={2} alignItems="center" aria-label={`${rating} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((step) => (
        <StarIcon key={step} size={size} color={step <= rating ? "var(--yellow10)" : "var(--color7)"} fill={step <= rating ? "currentColor" : "none"} />
      ))}
    </XStack>
  );
}

function CartButton({ onClick }: { onClick: () => void }) {
  const { count } = useCart();
  return (
    <YStack position="relative">
      <Button size="$3" variant="outlined" icon={<ShoppingCartIcon size={16} />} aria-label={`Cart, ${count} items`} onClick={onClick} data-testid="store-cart" />
      {count > 0 ? (
        <Circle
          theme="accent"
          size={18}
          backgroundColor="$background"
          position="absolute"
          top={-6}
          right={-6}
          pointerEvents="none"
          animation="quick"
          enterStyle={{ scale: 0.5, opacity: 0 }}
        >
          <SizableText size="$1" fontWeight="700" color="$color" lineHeight={18}>{count}</SizableText>
        </Circle>
      ) : null}
    </YStack>
  );
}

function StoreHeader({ onOpenCart }: { onOpenCart: () => void }) {
  const id = useStableId();
  const [query, setQuery] = useDemoState("store.query", "");
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$space.4" flexWrap="wrap">
      <YStack gap={2}>
        <H2 size="$8" margin={0}>Shop</H2>
        <Paragraph size="$2" color="$color10" margin={0}>Everyday tech, thoughtfully made.</Paragraph>
      </YStack>
      <XStack gap="$space.3" alignItems="center">
        <XStack position="relative" alignItems="center" width={260}>
          <YStack position="absolute" left={12} color="$color10" pointerEvents="none" zIndex={1}>
            <SearchIcon size={16} />
          </YStack>
          <Input id={`${id}-search`} aria-label="Search products" size="$3" placeholder="Search products" width="100%" paddingLeft={36} value={query} onChangeText={setQuery} />
        </XStack>
        <CartButton onClick={onOpenCart} />
      </XStack>
    </XStack>
  );
}

function FilterChips() {
  const [filter, setFilter] = useDemoState("store.filter", "All");
  return (
    <XStack gap="$space.2" flexWrap="wrap">
      {filters.map((name) => {
        const active = filter === name;
        return (
          <Button
            key={name}
            size="$2"
            borderRadius={999}
            paddingHorizontal="$space.3"
            theme={active ? "accent" : undefined}
            variant={active ? undefined : "outlined"}
            aria-pressed={active}
            onClick={() => setFilter(name)}
          >
            {name}
          </Button>
        );
      })}
    </XStack>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { cart, add } = useCart();
  const qty = cart[product.id] ?? 0;
  return (
    <Card bordered padding="$space.3" gap="$space.3" flexGrow={1} flexBasis={240} maxWidth={360} hoverStyle={{ borderColor: "$borderColorHover" }} animation="quick">
      <ProductTile product={product} height={160} iconSize={56} />
      <YStack gap="$space.2" paddingHorizontal="$space.1" flexGrow={1}>
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$space.2">
          <YStack gap={2} flex={1} minWidth={0}>
            <SizableText size="$4" fontWeight="600" ellipsis>{product.name}</SizableText>
            <SizableText size="$2" color="$color10">{product.category}</SizableText>
          </YStack>
          <SizableText size="$5" fontWeight="700">${product.price}</SizableText>
        </XStack>
        <XStack alignItems="center" gap="$space.2">
          <Stars rating={product.rating} />
          <SizableText size="$1" color="$color10">{product.reviews.toLocaleString()} reviews</SizableText>
        </XStack>
      </YStack>
      <Button
        size="$3"
        theme={qty > 0 ? "accent" : undefined}
        icon={qty > 0 ? <CheckIcon size={14} /> : <PlusIcon size={14} />}
        onClick={() => add(product.id)}
        data-testid={`store-add-${product.id}`}
      >
        {qty > 0 ? `In cart · ${qty}` : "Add to cart"}
      </Button>
    </Card>
  );
}

function ProductGrid() {
  const [filter] = useDemoState("store.filter", "All");
  const [query] = useDemoState("store.query", "");
  const byCategory = filter === "All" ? products : products.filter((p) => p.category === filter);
  const q = query.trim().toLowerCase();
  const visible = q ? byCategory.filter((p) => p.name.toLowerCase().includes(q)) : byCategory;

  if (visible.length === 0) {
    return (
      <YStack flex={1} width="100%" alignItems="center" justifyContent="center" gap="$space.3" paddingVertical="$space.8">
        <Circle size={64} backgroundColor="$color3" color="$color10">
          <SearchIcon size={28} strokeWidth={1.5} />
        </Circle>
        <SizableText fontWeight="600">No products found</SizableText>
        <Paragraph size="$2" color="$color10" margin={0} textAlign="center">Try a different search or filter.</Paragraph>
      </YStack>
    );
  }

  return (
    <XStack flexWrap="wrap" gap="$space.4" alignItems="stretch">
      {visible.map((product) => <ProductCard key={product.id} product={product} />)}
    </XStack>
  );
}

function QuantityStepper({ value, onChange, size = "$2", testId }: { value: number; onChange: (next: number) => void; size?: string; testId?: string }) {
  return (
    <XGroup size={size} bordered separator={<Separator vertical />}>
      <Group.Item>
        <Button size={size} chromeless icon={<MinusIcon size={12} />} aria-label="Decrease quantity" onClick={() => onChange(value - 1)} />
      </Group.Item>
      <Group.Item>
        <XStack width={36} alignItems="center" justifyContent="center">
          <SizableText size="$2" fontWeight="600" data-testid={testId}>{value}</SizableText>
        </XStack>
      </Group.Item>
      <Group.Item>
        <Button size={size} chromeless icon={<PlusIcon size={12} />} aria-label="Increase quantity" onClick={() => onChange(value + 1)} />
      </Group.Item>
    </XGroup>
  );
}

function CartLine({ product, qty }: { product: Product; qty: number }) {
  const { add, remove } = useCart();
  return (
    <XStack gap="$space.3" alignItems="center" flexWrap="wrap">
      <XStack flex={1} minWidth={180} gap="$space.3" alignItems="center">
        <YStack width={56} flexShrink={0}>
          <ProductTile product={product} height={56} iconSize={24} radius="$radius.3" />
        </YStack>
        <YStack flex={1} minWidth={0} gap={2}>
          <SizableText fontWeight="600" ellipsis>{product.name}</SizableText>
          <SizableText size="$2" color="$color10" ellipsis>{money(product.price)} each</SizableText>
        </YStack>
      </XStack>
      <XStack flexShrink={0} gap="$space.3" alignItems="center">
        <QuantityStepper value={qty} onChange={(next) => (next > 0 ? add(product.id, next - qty) : remove(product.id))} />
        <SizableText fontWeight="600" width={72} textAlign="right" ellipsis>{money(product.price * qty)}</SizableText>
        <Button size="$2" chromeless circular icon={<Trash2Icon size={14} />} aria-label={`Remove ${product.name}`} color="$color10" onClick={() => remove(product.id)} />
      </XStack>
    </XStack>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <XStack justifyContent="space-between" alignItems="center">
      <SizableText size={strong ? "$5" : "$3"} fontWeight={strong ? "700" : "400"} color={strong ? "$color" : "$color11"}>{label}</SizableText>
      <SizableText size={strong ? "$5" : "$3"} fontWeight={strong ? "700" : "500"}>{value}</SizableText>
    </XStack>
  );
}

function CartSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { cart, count } = useCart();
  const id = useStableId();
  const lines = products.filter((p) => cart[p.id]).map((p) => ({ product: p, qty: cart[p.id] }));
  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const shipping = subtotal === 0 || subtotal >= freeShippingOver ? 0 : shippingFee;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} snapPoints={[80]} maxWidth={600} marginLeft="auto" marginRight="auto" aria-labelledby={`${id}-title`}>
      <Sheet.Overlay />
      <Sheet.Handle />
      <Sheet.Frame padding="$space.5" gap="$space.4" borderWidth={1} borderStyle="solid" borderColor="$borderColor" data-testid="store-cart-sheet">
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$space.2">
            <H4 id={`${id}-title`} margin={0}>Your cart</H4>
            <SizableText size="$3" color="$color10">{count} {count === 1 ? "item" : "items"}</SizableText>
          </XStack>
          <Button size="$2" chromeless circular icon={<XIcon size={16} />} aria-label="Close cart" onClick={() => onOpenChange(false)} />
        </XStack>

        {lines.length === 0 ? (
          <YStack flex={1} alignItems="center" justifyContent="center" gap="$space.3" paddingVertical="$space.8">
            <Circle size={64} backgroundColor="$color3" color="$color10">
              <ShoppingCartIcon size={28} strokeWidth={1.5} />
            </Circle>
            <SizableText fontWeight="600">Your cart is empty</SizableText>
            <Paragraph size="$2" color="$color10" margin={0} textAlign="center">Add something from the grid and it will show up here.</Paragraph>
          </YStack>
        ) : (
          <Sheet.ScrollView gap="$space.4">
            {lines.map((line) => <CartLine key={line.product.id} product={line.product} qty={line.qty} />)}
          </Sheet.ScrollView>
        )}

        <Separator />
        <YStack gap="$space.2">
          <TotalRow label="Subtotal" value={money(subtotal)} />
          <TotalRow label="Shipping" value={shipping === 0 ? "Free" : money(shipping)} />
          <Separator marginVertical="$space.1" />
          <TotalRow label="Total" value={money(subtotal + shipping)} strong />
        </YStack>
        <Button theme="accent" size="$4" disabled={lines.length === 0} iconAfter={<ShoppingCartIcon size={16} />}>
          Checkout
        </Button>
      </Sheet.Frame>
    </Sheet>
  );
}

function StorePage() {
  const [open, setOpen] = useControllableState<boolean>("cartOpen", { defaultValue: false });
  return (
    <Page padding="$space.6" gap="$space.5">
      <StoreHeader onOpenCart={() => setOpen(true)} />
      <FilterChips />
      <ProductGrid />
      <CartSheet open={open ?? false} onOpenChange={setOpen} />
    </Page>
  );
}

const colours = [
  { value: "midnight", label: "Midnight", color: "$gray12Light" },
  { value: "ocean", label: "Ocean", color: "$blue9Light" },
  { value: "sage", label: "Sage", color: "$green9Light" },
  { value: "coral", label: "Coral", color: "$orange9Light" },
];
const sizes = ["S", "M", "L", "XL"];

function ProductDetail() {
  const product = products[2];
  const { add } = useCart();
  const id = useStableId();
  const [colour, setColour] = useDemoState("store.detail.colour", "ocean");
  const [size, setSize] = useDemoState("store.detail.size", "M");
  const [qty, setQty] = useDemoState("store.detail.qty", 1);
  const [wished, setWished] = useDemoState("store.detail.wished", false);
  const [added, setAdded] = useDemoState("store.detail.added", false);
  const colourLabel = colours.find((c) => c.value === colour)?.label ?? colour;

  return (
    <Page padding="$space.6">
      <XStack gap="$space.7" flexWrap="wrap" alignItems="flex-start">
        <YStack flex={1} flexBasis={360} minWidth={280} gap="$space.3">
          <ProductTile product={product} height={440} iconSize={144} radius="$radius.6" />
          <XStack gap="$space.2">
            {products.slice(0, 4).map((p, i) => (
              <YStack key={p.id} flex={1} borderWidth={2} borderStyle="solid" borderColor={i === 2 ? "$color" : "transparent"} borderRadius="$radius.4" padding={2}>
                <ProductTile product={p} height={64} iconSize={24} radius="$radius.3" />
              </YStack>
            ))}
          </XStack>
        </YStack>

        <YStack flex={1} flexBasis={360} minWidth={300} gap="$space.4">
          <YStack gap="$space.2">
            <SizableText size="$2" color="$color10" textTransform="uppercase" letterSpacing={1} fontWeight="600">{product.category}</SizableText>
            <H2 size="$9" margin={0}>{product.name}</H2>
            <XStack alignItems="center" gap="$space.2">
              <Stars rating={product.rating} size={16} />
              <SizableText size="$3" fontWeight="600">{product.rating}.0</SizableText>
              <SizableText size="$3" color="$color10">· {product.reviews.toLocaleString()} reviews</SizableText>
            </XStack>
          </YStack>
          <XStack alignItems="baseline" gap="$space.2" flexWrap="wrap">
            <SizableText size="$8" fontWeight="700">${product.price}</SizableText>
            <SizableText size="$3" color="$color10" textDecorationLine="line-through">$299</SizableText>
            <SizableText size="$2" theme="green" color="$color10" fontWeight="600" backgroundColor="$color3" paddingHorizontal="$space.2" borderRadius={999}>Save $50</SizableText>
          </XStack>
          <Paragraph size="$3" color="$color11" margin={0}>
            A slim titanium case, an always-on display and a week of battery. Tracks sleep, heart rate and every workout without getting in the way.
          </Paragraph>

          <Separator />

          <YStack gap="$space.2">
            <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$space.2">
              <SizableText size="$3" fontWeight="600">Colour</SizableText>
              <SizableText size="$3" color="$color10">{colourLabel}</SizableText>
            </XStack>
            <RadioGroup value={colour} onValueChange={setColour} orientation="horizontal" gap="$space.3" flexWrap="wrap" aria-label="Colour">
              {colours.map((c) => (
                <RadioGroup.Item key={c.value} value={c.value} id={`${id}-colour-${c.value}`} size={32} aria-label={c.label} data-testid={`store-colour-${c.value}`}>
                  <Circle size={22} backgroundColor={c.color} />
                </RadioGroup.Item>
              ))}
            </RadioGroup>
          </YStack>

          <YStack gap="$space.2">
            <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$space.2">
              <SizableText size="$3" fontWeight="600">Band size</SizableText>
              <SizableText tag="a" href="#" size="$2" color="$color10" textDecorationLine="underline" hoverStyle={{ color: "$color12" }}>Size guide</SizableText>
            </XStack>
            <ToggleGroup type="single" value={size} onValueChange={setSize} disableDeactivation size="$3" aria-label="Band size">
              {sizes.map((s) => (
                <ToggleGroup.Item key={s} value={s} paddingHorizontal="$space.4" data-testid={`store-size-${s}`}>{s}</ToggleGroup.Item>
              ))}
            </ToggleGroup>
          </YStack>

          <XStack gap="$space.3" alignItems="center" flexWrap="wrap">
            <QuantityStepper value={qty} onChange={(next) => setQty(Math.max(1, next))} size="$3" testId="store-detail-qty" />
            <Button
              theme="accent"
              size="$4"
              flex={1}
              minWidth={160}
              icon={added ? <CheckIcon size={16} /> : <ShoppingCartIcon size={16} />}
              onClick={() => {
                add(product.id, qty);
                setAdded(true);
                setTimeout(() => setAdded(false), 1500);
              }}
              data-testid="store-detail-add"
            >
              {added ? "Added to cart" : "Add to cart"}
            </Button>
            <Button
              size="$4"
              variant="outlined"
              theme={wished ? "red" : undefined}
              icon={<HeartIcon size={16} fill={wished ? "currentColor" : "none"} />}
              aria-pressed={wished}
              onClick={() => setWished(!wished)}
              data-testid="store-detail-wishlist"
            >
              {wished ? "Saved" : "Wishlist"}
            </Button>
          </XStack>

          <Accordion type="multiple" defaultValue={["description"]} size="$3">
            <Accordion.Item value="description">
              <Accordion.Header>
                <Accordion.Trigger>
                  <SizableText size="$3" fontWeight="600">Description</SizableText>
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <Paragraph size="$3" color="$color11" margin={0}>
                  44mm titanium case with sapphire glass. Water resistant to 50m. Works with iOS and Android and pairs with any standard 22mm band.
                </Paragraph>
              </Accordion.Content>
            </Accordion.Item>
            <Accordion.Item value="shipping">
              <Accordion.Header>
                <Accordion.Trigger>
                  <SizableText size="$3" fontWeight="600">Shipping</SizableText>
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <Paragraph size="$3" color="$color11" margin={0}>
                  Free standard shipping on orders over ${freeShippingOver}. Express delivery in 1–2 business days for $15.
                </Paragraph>
              </Accordion.Content>
            </Accordion.Item>
            <Accordion.Item value="returns">
              <Accordion.Header>
                <Accordion.Trigger>
                  <SizableText size="$3" fontWeight="600">Returns</SizableText>
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <Paragraph size="$3" color="$color11" margin={0}>
                  30-day returns, no questions asked. Start a return from your orders page and drop it at any carrier location.
                </Paragraph>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
        </YStack>
      </XStack>
    </Page>
  );
}

export const StoreExample: ExampleDemos = {
  name: "Store",
  description: "A small storefront: a filterable product grid with ratings, a cart kept in demo state and opened in a Sheet, and a product detail page with colour, size and quantity pickers.",
  demos: [
    {
      title: "Product grid",
      description: "Filter chips narrow the grid; adding a product increments the cart badge.",
      render: () => <StorePage />,
      shot: { click: "store-add-pulse", wait: 300 },
    },
    {
      title: "Cart sheet",
      description: "The cart button opens a Sheet with quantity steppers, line totals and a checkout summary.",
      render: () => <StorePage />,
      shot: { click: ["store-add-pulse", "store-add-orbit", "store-cart"], wait: 400 },
    },
    {
      title: "Product detail",
      description: "A two-column detail with colour swatches (RadioGroup), a size ToggleGroup, a quantity stepper and an Accordion of extra information.",
      render: () => <ProductDetail />,
    },
  ],
};
