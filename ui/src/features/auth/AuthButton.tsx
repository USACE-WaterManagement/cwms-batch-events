import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Button } from "@usace/groundwork";
import { FiLogIn, FiLogOut } from "react-icons/fi";

const AuthButton = () => {
  const auth = useAuth();

  return (
    <Button
      color="white"
      style="plain"
      className="gw-flex gw-items-center gw-gap-2 gw-font-normal gw-px-2 gw-shrink-0"
      aria-label={auth.isAuth ? "Logout" : "Login"}
      onClick={auth.isAuth ? auth.logout : auth.login}
    >
      {auth.isAuth ? <FiLogOut aria-hidden="true" /> : <FiLogIn aria-hidden="true" />}
      <span className="hidden min-[360px]:inline">{auth.isAuth ? "Logout" : "Login"}</span>
    </Button>
  );
};

export default AuthButton;
