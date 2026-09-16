import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Button, Card, H1, Text } from "@usace/groundwork";
import { FiLogIn } from "react-icons/fi";

interface LoginPromptProps {
  title: string;
  description: string;
}

const LoginPrompt = ({ title, description }: LoginPromptProps) => {
  const auth = useAuth();

  return (
    <main className="flex min-h-[28rem] items-center justify-center py-10">
      <Card className="w-full max-w-xl overflow-hidden border-blue-200 bg-white p-0 text-center shadow-md">
        <div className="h-1.5 bg-blue-700" />
        <div className="p-7 sm:p-10">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <FiLogIn aria-hidden="true" className="h-7 w-7" />
          </div>
          <H1>{title}</H1>
          <Text className="mx-auto mt-3 max-w-md text-center">{description}</Text>
          <div className="mt-6 flex justify-center">
            <Button className="flex items-center gap-2" onClick={auth.login}>
              <FiLogIn aria-hidden="true" />
              Login
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
};

export default LoginPrompt;
