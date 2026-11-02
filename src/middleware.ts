import { Role } from "@/lib/enums";
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";


// أي مسار (Prefix) بيسمح بالدخول له لأنهي أدوار
const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: [Role.ADMIN, Role.HEAD_OF_SALES, Role.HEAD_OF_TELE_SALES] },
  { prefix: "/tele-sales", roles: [Role.ADMIN, Role.HEAD_OF_SALES, Role.HEAD_OF_TELE_SALES, Role.TELE_SALES] },
  { prefix: "/sales", roles: [Role.ADMIN, Role.HEAD_OF_SALES, Role.HEAD_OF_TELE_SALES, Role.SALES] },
  { prefix: "/account", roles: [Role.ADMIN] },
];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    const rule = ROUTE_ROLES.find((r) => path.startsWith(r.prefix));
    if (rule && token && !rule.roles.includes(token.role as Role)) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/login" },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/tele-sales/:path*", "/sales/:path*", "/account/:path*"],
};
