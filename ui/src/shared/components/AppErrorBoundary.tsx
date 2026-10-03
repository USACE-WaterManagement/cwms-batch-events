import React from "react";
import { Button, H2, Text } from "@usace/groundwork";
import toast from "react-hot-toast";

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    toast.error(error.message);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 rounded-lg border border-red-300 bg-red-50 p-6">
          <H2>Something went wrong</H2>
          <Text>{this.state.error.message}</Text>
          <Button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
